# Rhythm-Reaction-Trainer

## How to run (local)
1. Create a copy of the Rhythym Reaction Trainer.
2. Open terminal and type the commands in order:
    - npm install -g serve
    - npm fund (Optional)
    - serve . -l 8000
3. Once done you will get a notification saying

## Acceptance criteria
- Beat‑Click spawns cues in sync with audio using `AudioContext.currentTime`.
- Judgements: Perfect ±30ms (+300), Good ±60ms (+100), Miss otherwise (0).
- HUD shows score, combo, and last judgement.
- Mode selection UI loads and switches to Beat‑Click.

## Notes
- iOS is out of scope for the prototype due to audio autoplay restrictions.
- Use `feature/beat-click` branch for development and merge to `dev` then `main`.
