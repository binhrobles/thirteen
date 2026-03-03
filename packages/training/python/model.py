"""
Neural network architecture for Tiến Lên bot.

State-action scoring: encodes state once, scores each candidate action.
See docs/rl-training-design.md Section 4.
"""

import torch
import torch.nn as nn

from features import STATE_SIZE, ACTION_SIZE


class TienLenNet(nn.Module):
    """
    State-action scoring network.

    Given a state and a variable number of candidate actions,
    outputs a score for each (state, action) pair.
    """

    def __init__(self):
        super().__init__()

        # State encoder: 392 → 256 → 256
        self.state_encoder = nn.Sequential(
            nn.Linear(STATE_SIZE, 256),
            nn.ReLU(),
            nn.Linear(256, 256),
            nn.ReLU(),
        )

        # Action encoder: 63 → 128
        self.action_encoder = nn.Sequential(
            nn.Linear(ACTION_SIZE, 128),
            nn.ReLU(),
        )

        # Scorer: 384 → 128 → 1
        self.scorer = nn.Sequential(
            nn.Linear(384, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
        )

        # Value head (for PPO, not used in imitation learning)
        self.value_head = nn.Sequential(
            nn.Linear(256, 128),
            nn.ReLU(),
            nn.Linear(128, 1),
        )

    def encode_state(self, state: torch.Tensor) -> torch.Tensor:
        """Encode state(s). Shape: (batch, STATE_SIZE) → (batch, 256)"""
        return self.state_encoder(state)

    def score_actions(
        self,
        state_emb: torch.Tensor,
        action_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Score a batch of actions against a state embedding.

        Args:
            state_emb: (batch, 256) or (256,) — state embedding
            action_features: (batch, num_actions, ACTION_SIZE) — candidate actions

        Returns:
            scores: (batch, num_actions) — one score per action
        """
        batch_size = action_features.shape[0]
        num_actions = action_features.shape[1]

        # Encode all actions: (batch, num_actions, 128)
        action_emb = self.action_encoder(action_features)

        # Expand state embedding to match: (batch, num_actions, 256)
        if state_emb.dim() == 1:
            state_emb = state_emb.unsqueeze(0)
        state_expanded = state_emb.unsqueeze(1).expand(-1, num_actions, -1)

        # Concatenate and score: (batch, num_actions, 384) → (batch, num_actions, 1)
        combined = torch.cat([state_expanded, action_emb], dim=-1)
        scores = self.scorer(combined).squeeze(-1)  # (batch, num_actions)

        return scores

    def forward(
        self,
        state: torch.Tensor,
        action_features: torch.Tensor,
    ) -> torch.Tensor:
        """
        Full forward pass: encode state, score all actions.

        Args:
            state: (batch, STATE_SIZE)
            action_features: (batch, num_actions, ACTION_SIZE)

        Returns:
            scores: (batch, num_actions)
        """
        state_emb = self.encode_state(state)
        return self.score_actions(state_emb, action_features)

    def value(self, state: torch.Tensor) -> torch.Tensor:
        """Estimate state value (for PPO). Shape: (batch, STATE_SIZE) → (batch, 1)"""
        state_emb = self.encode_state(state)
        return self.value_head(state_emb)
