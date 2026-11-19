const line = (y) => Array.from({ length: 241 }, (_, k) => [-0.8 + (1.6 * k) / 240, y]);
Beeson.trajectories({
  families: [
    { points: line(0.20046), tone: 'orange', alpha: 0.6 },
    { points: line(-0.19954), tone: 'violet', alpha: 0.6, glow: true },
  ],
});
