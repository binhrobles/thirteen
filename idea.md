We're going to build a mobile game for Tien len / Thirteen (https://en.wikipedia.org/wiki/Ti%E1%BA%BFn_l%C3%AAn)

You can find a reference for the logic I used in a previous build here: https://github.com/binhrobles/thirteen

## The Game
Use the wiki to learn the game and the codebase for references on how logic is applied -- there's a lot of local variants and we play a specific version. We can tune these rules as we go.

When playing w/ friends, we usually play multiple rounds over the course of a "tourney". The winner collects 4 points, 2nd person to go out collects 2, 3rd gets 1, 4th gets 0. And we play to 21 points. Another game kicks off when the previous one ends, the dealer is the person who took last, and power starts w/ the person who took first.

For now, we'll just have a concept of a "seat", where if you go to the site, you can take an empty seat in the game. The other seats will be filled by others, and you can start a game or tourney once all 4 are seated.

## UX
I'd like to keep this a one hand, vertical experience.

Keeping 13 cards in hand is visually difficult on mobile. we'll want to support either horizontally scrolling to view your whole hand or using like a drawer to take up more screen space from the bottom of the viewport in order to present all the cards.

It's important to be able to review past hands played in the current round. The middle pile should visually show the last played hand prominently, but tapping / clicking it should pull a history of hands played this round. We play with rules that runs can go indefinitely, so it's possible that hands can be 10+ cards long, so we'll want to be able to shrink the card sprites to fit.

## Tech
I'm agnostic to the tech used. I want it to be mobile-first and live multiplayer w/ my friends. I'm most comfortable w/ JS setups, like a PWA type thing, but I'm open to vending a Godot or Unity-based game if there's a good mobile story there.

## Computer Players
After getting the initial game up and off the ground, I would like to reinforcement train a model on the game. We'll build the game and create game state primitives that will lend itself to that training. We'll assign a computer to one or many seats, and the model will be invoked on their turn.

Ideally I'd like to train and vend that model as an artifact, which I can then run in elastic compute, like a Lambda or something similar -- maybe something more native to that sort of thing, open to suggestions. Lets brainstorm different models we can use for this. I can set up whatever infra we need to do this, but let's create estimates for time, cost, iterations, etc.
