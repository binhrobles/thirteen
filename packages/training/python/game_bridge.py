"""
Bridge to the TypeScript game engine via stdin/stdout JSON-line protocol.

Spawns a persistent Node.js subprocess running the game server.
Python sends commands, receives game state responses.
"""

import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TurnInfo:
    state: dict
    player: int
    valid_actions: list[list[dict]]
    can_pass: bool


@dataclass
class GameOver:
    win_order: list[int]


class GameBridge:
    """Manages a persistent TS game server subprocess."""

    def __init__(self, repo_root: str | None = None):
        if repo_root is None:
            # Walk up from this file to find repo root
            p = Path(__file__).resolve()
            while p != p.parent:
                if (p / ".git").exists():
                    break
                p = p.parent
            repo_root = str(p)

        self._proc = subprocess.Popen(
            ["yarn", "workspace", "@thirteen/game-logic", "game-server"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            cwd=repo_root,
            text=True,
            bufsize=1,  # line-buffered
        )

    def _send(self, obj: dict) -> dict:
        assert self._proc.stdin and self._proc.stdout
        self._proc.stdin.write(json.dumps(obj) + "\n")
        self._proc.stdin.flush()

        # Read lines until we get valid JSON (skip yarn's non-JSON output)
        while True:
            line = self._proc.stdout.readline()
            if not line:
                raise RuntimeError("Game server process died")
            line = line.strip()
            if not line:
                continue
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue  # skip non-JSON lines (yarn output)

    def _parse_response(self, resp: dict) -> TurnInfo | GameOver:
        if resp["type"] == "turn":
            return TurnInfo(
                state=resp["state"],
                player=resp["player"],
                valid_actions=resp["valid_actions"],
                can_pass=resp["can_pass"],
            )
        elif resp["type"] == "game_over":
            return GameOver(win_order=resp["win_order"])
        elif resp["type"] == "error":
            raise RuntimeError(f"Game server error: {resp['message']}")
        else:
            raise RuntimeError(f"Unexpected response type: {resp['type']}")

    def new_game(self, greedy_seats: list[int] | None = None) -> TurnInfo | GameOver:
        cmd: dict = {"cmd": "new_game"}
        if greedy_seats:
            cmd["greedy_seats"] = greedy_seats
        return self._parse_response(self._send(cmd))

    def step(self, action_index: int) -> TurnInfo | GameOver:
        return self._parse_response(
            self._send({"cmd": "step", "action_index": action_index})
        )

    def close(self):
        if self._proc.poll() is None:
            try:
                assert self._proc.stdin
                self._proc.stdin.write('{"cmd":"quit"}\n')
                self._proc.stdin.flush()
                self._proc.stdin.close()
            except (BrokenPipeError, OSError):
                pass
            self._proc.wait(timeout=5)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


if __name__ == "__main__":
    """Quick test: play a game with random actions."""
    import random

    with GameBridge() as bridge:
        turn = bridge.new_game()
        moves = 0

        while True:
            num_actions = len(turn.valid_actions) + (1 if turn.can_pass else 0)
            action = random.randrange(num_actions)
            result = bridge.step(action)
            moves += 1

            if isinstance(result, GameOver):
                print(f"Game over after {moves} moves. Win order: {result.win_order}")
                break
            turn = result

        # Play a few more games to test reuse
        for i in range(5):
            turn = bridge.new_game()
            game_moves = 0
            while True:
                num_actions = len(turn.valid_actions) + (1 if turn.can_pass else 0)
                action = random.randrange(num_actions)
                result = bridge.step(action)
                game_moves += 1
                if isinstance(result, GameOver):
                    print(f"Game {i+2}: {game_moves} moves, winner: player {result.win_order[0]}")
                    break
                turn = result

    print("All tests passed!")
