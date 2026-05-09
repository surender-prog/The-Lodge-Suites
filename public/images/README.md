# Images

The property's photography lives here. Reference these from `App.jsx` as `/images/<filename>` (Vite serves the `public/` folder from the site root).

## Files included

- `logo.png` — official LS Lodge Suites logo (dark + gold, with crosshatch pattern)
- `27574xxxx.jpg`, `30xxxxxxx.jpg`, `71xxxxxxx.jpg`, `76xxxxxxx.jpg`, `80xxxxxxx.jpg` — property photography (51 files)

## Suggested mapping

The numeric filenames are from the original photo set. Skim them once and rename to descriptive names so the codebase reads cleanly. A reasonable convention:

```
exterior-day.jpg
exterior-night.jpg
lobby-1.jpg
lobby-reception.jpg
suite-deluxe-bed.jpg
suite-deluxe-living.jpg
suite-onebed-bed.jpg
suite-onebed-living.jpg
suite-twobed-bed.jpg
suite-presidential-bed.jpg
bath-1.jpg
kitchen-1.jpg
pool-day.jpg
gym.jpg
sauna.jpg
billiards.jpg
kids-play.jpg
view-marina.jpg
view-city.jpg
detail-pillow-blue.jpg
detail-vase.jpg
detail-amenity-tray.jpg
```

Once renamed, update the `IMG` constant near the top of `src/App.jsx`:

```js
const IMG = {
  heroExterior: "/images/exterior-night.jpg",
  lobby: "/images/lobby-reception.jpg",
  // …
};
```

## Not included

Anything sourced from Unsplash in the current `IMG` constant is a placeholder — replace before launch.
