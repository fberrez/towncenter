"use client";

// The drifting world map on the gate screen: a field of dots, slowly sliding
// west, with blue city dots lighting up one at a time.
//
// Four things here are load-bearing and easy to undo by accident:
//
// 1. The field is drawn TWICE side by side and the group slides exactly one
//    field width before restarting, so the loop point is invisible.
// 2. One `<path>` reused through two `<use>`: 5 586 dots would otherwise be
//    that many DOM elements.
// 3. The path is written in RELATIVE coordinates and each dot is a SQUARE.
//    Absolute coordinates and SVG circles (two arcs each) take ~158 000
//    characters of `d`, shipped twice (document + React payload) on the most
//    public route of the product, for a decoration. Squares in relative
//    coordinates take ~37 ko and the difference is invisible at three pixels.
// 4. The path is built during render, not after mount. Built after mount, the
//    map depended on hydration and stayed PERMANENTLY empty whenever hydration
//    did not run, with no error.
//
// `prefers-reduced-motion` stops the MOVEMENT, not the map: slow permanent
// motion in peripheral vision is what triggers vestibular discomfort.

import { useMemo } from "react";

import {
  COLS,
  ROWS,
  decodeMask,
  isLand,
  toGridCell,
} from "./land";

import styles from "./worldmap.module.css";

/** Grid step, in viewBox units. */
const STEP = 8;
/** Side of a land dot. Three units on a step of eight gives the weave. */
const SIDE = 3;
/** Radius of the city dots, which stay CIRCLES so they read as different. */
const R = 3.2;

/**
 * The blue dots. CITIES, not targets — see the warning in `land.ts`. They sit
 * at real longitudes and latitudes so they fall on coastlines rather than at
 * random, and Europe carries several: a world map where France never lights up
 * would be pretty and false.
 *
 * Delays are spread over the whole cycle by a step coprime with the number of
 * cities, so two geographic neighbours never light up together.
 */
const CITIES: readonly { lon: number; lat: number; delay: number }[] = [
  { lon: 2.24, lat: 48.88, delay: 0.0 },
  { lon: 4.84, lat: 45.76, delay: 1.01 },
  { lon: 5.37, lat: 43.3, delay: 2.02 },
  { lon: -0.58, lat: 44.84, delay: 3.03 },
  { lon: -1.55, lat: 47.22, delay: 4.04 },
  { lon: 7.75, lat: 48.57, delay: 5.05 },
  { lon: 1.44, lat: 43.6, delay: 6.06 },
  { lon: 3.06, lat: 50.63, delay: 7.07 },
  { lon: -0.13, lat: 51.51, delay: 8.08 },
  { lon: -2.24, lat: 53.48, delay: 9.09 },
  { lon: -3.19, lat: 55.95, delay: 10.1 },
  { lon: -6.26, lat: 53.35, delay: 11.11 },
  { lon: 4.35, lat: 50.85, delay: 12.12 },
  { lon: 4.9, lat: 52.37, delay: 13.12 },
  { lon: 13.4, lat: 52.52, delay: 14.13 },
  { lon: 8.68, lat: 50.11, delay: 0.14 },
  { lon: 11.58, lat: 48.14, delay: 1.15 },
  { lon: 9.99, lat: 53.55, delay: 2.16 },
  { lon: 2.17, lat: 41.39, delay: 3.17 },
  { lon: -3.7, lat: 40.42, delay: 4.18 },
  { lon: -5.98, lat: 37.39, delay: 5.19 },
  { lon: -9.14, lat: 38.72, delay: 6.2 },
  { lon: 12.5, lat: 41.9, delay: 7.21 },
  { lon: 9.19, lat: 45.46, delay: 8.22 },
  { lon: 14.51, lat: 35.9, delay: 9.23 },
  { lon: 8.54, lat: 47.38, delay: 10.24 },
  { lon: 16.37, lat: 48.21, delay: 11.25 },
  { lon: 14.44, lat: 50.08, delay: 12.26 },
  { lon: 21.01, lat: 52.23, delay: 13.27 },
  { lon: 19.04, lat: 47.5, delay: 14.28 },
  { lon: 18.07, lat: 59.33, delay: 0.29 },
  { lon: 10.75, lat: 59.91, delay: 1.3 },
  { lon: 12.57, lat: 55.68, delay: 2.31 },
  { lon: 24.94, lat: 60.17, delay: 3.32 },
  { lon: 28.98, lat: 41.01, delay: 4.33 },
  { lon: 23.73, lat: 37.98, delay: 5.34 },
  { lon: 30.52, lat: 50.45, delay: 6.35 },
  { lon: 37.62, lat: 55.76, delay: 7.36 },
  { lon: -74.0, lat: 40.71, delay: 8.37 },
  { lon: -71.06, lat: 42.36, delay: 9.38 },
  { lon: -75.17, lat: 39.95, delay: 10.38 },
  { lon: -77.04, lat: 38.9, delay: 11.39 },
  { lon: -80.19, lat: 25.76, delay: 12.4 },
  { lon: -84.39, lat: 33.75, delay: 13.41 },
  { lon: -87.63, lat: 41.88, delay: 14.42 },
  { lon: -90.2, lat: 38.63, delay: 0.43 },
  { lon: -95.37, lat: 29.76, delay: 1.44 },
  { lon: -96.8, lat: 32.78, delay: 2.45 },
  { lon: -104.99, lat: 39.74, delay: 3.46 },
  { lon: -112.07, lat: 33.45, delay: 4.47 },
  { lon: -118.24, lat: 34.05, delay: 5.48 },
  { lon: -122.33, lat: 47.61, delay: 6.49 },
  { lon: -122.4, lat: 37.77, delay: 7.5 },
  { lon: -79.38, lat: 43.65, delay: 8.51 },
  { lon: -73.57, lat: 45.5, delay: 9.52 },
  { lon: -123.12, lat: 49.28, delay: 10.53 },
  { lon: -99.13, lat: 19.43, delay: 11.54 },
  { lon: -74.07, lat: 4.71, delay: 12.55 },
  { lon: -77.04, lat: -12.05, delay: 13.56 },
  { lon: -70.65, lat: -33.45, delay: 14.57 },
  { lon: -58.38, lat: -34.6, delay: 0.58 },
  { lon: -43.17, lat: -22.91, delay: 1.59 },
  { lon: -46.6, lat: -23.55, delay: 2.6 },
  { lon: -38.5, lat: -12.97, delay: 3.61 },
  { lon: -7.59, lat: 33.57, delay: 4.62 },
  { lon: 3.06, lat: 36.75, delay: 5.62 },
  { lon: 10.18, lat: 36.81, delay: 6.63 },
  { lon: 31.24, lat: 30.04, delay: 7.64 },
  { lon: 32.55, lat: 15.5, delay: 8.65 },
  { lon: 38.75, lat: 9.03, delay: 9.66 },
  { lon: 36.82, lat: -1.29, delay: 10.67 },
  { lon: 3.38, lat: 6.52, delay: 11.68 },
  { lon: -17.44, lat: 14.72, delay: 12.69 },
  { lon: -0.19, lat: 5.6, delay: 13.7 },
  { lon: 13.24, lat: -8.84, delay: 14.71 },
  { lon: 28.05, lat: -26.2, delay: 0.72 },
  { lon: 18.4, lat: -33.92, delay: 1.73 },
  { lon: 55.27, lat: 25.2, delay: 2.74 },
  { lon: 46.72, lat: 24.71, delay: 3.75 },
  { lon: 35.21, lat: 31.77, delay: 4.76 },
  { lon: 72.88, lat: 19.08, delay: 5.77 },
  { lon: 77.21, lat: 28.61, delay: 6.78 },
  { lon: 88.36, lat: 22.57, delay: 7.79 },
  { lon: 80.27, lat: 13.08, delay: 8.8 },
  { lon: 67.0, lat: 24.86, delay: 9.81 },
  { lon: 90.4, lat: 23.81, delay: 10.82 },
  { lon: 100.5, lat: 13.75, delay: 11.83 },
  { lon: 106.8, lat: -6.21, delay: 12.84 },
  { lon: 101.69, lat: 3.14, delay: 13.85 },
  { lon: 103.8, lat: 1.35, delay: 14.86 },
  { lon: 120.98, lat: 14.6, delay: 0.87 },
  { lon: 105.85, lat: 21.03, delay: 1.88 },
  { lon: 114.17, lat: 22.32, delay: 2.88 },
  { lon: 121.47, lat: 31.23, delay: 3.89 },
  { lon: 116.4, lat: 39.9, delay: 4.9 },
  { lon: 113.26, lat: 23.13, delay: 5.91 },
  { lon: 126.98, lat: 37.57, delay: 6.92 },
  { lon: 139.7, lat: 35.68, delay: 7.93 },
  { lon: 135.5, lat: 34.69, delay: 8.94 },
  { lon: 121.56, lat: 25.03, delay: 9.95 },
  { lon: 151.2, lat: -33.87, delay: 10.96 },
  { lon: 144.96, lat: -37.81, delay: 11.97 },
  { lon: 174.76, lat: -36.85, delay: 12.98 },
  { lon: 153.03, lat: -27.47, delay: 13.99 },
];

export function WorldMap() {
  // The path of every land dot, built once. Each dot is a square written
  // relative to the previous one: `m` after a `z` restarts from the beginning
  // of the previous sub-path, which is exactly what is needed here.
  const path = useMemo(() => {
    const bytes = decodeMask();
    const parts: string[] = [];
    // Position of the last square placed: deltas are counted from it.
    let lastX = 0;
    let lastY = 0;
    let first = true;

    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLS; column += 1) {
        if (!isLand(bytes, row * COLS + column)) continue;

        const x = column * STEP;
        const y = row * STEP;

        if (first) {
          parts.push(`M${x} ${y}h${SIDE}v${SIDE}h-${SIDE}z`);
          first = false;
        } else {
          parts.push(
            `m${x - lastX} ${y - lastY}h${SIDE}v${SIDE}h-${SIDE}z`,
          );
        }

        lastX = x;
        lastY = y;
      }
    }

    return parts.join("");
  }, []);

  const width = COLS * STEP;
  const height = ROWS * STEP;

  return (
    <svg
      className={styles.worldmap}
      viewBox={`0 0 ${width} ${height}`}
      // `slice` fills the HEIGHT and therefore crops the sides. The field is
      // 2.7:1 and the panel about 0.9:1, so `meet` left two large empty bands.
      // It works here only because the field SCROLLS: what is cropped comes
      // round. The price is density — the grid went from 150 to 220 columns at
      // the same time, and the two settings go together.
      preserveAspectRatio="xMidYMid slice"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <path id="land" d={path} />
      </defs>

      <g
        className={styles.drift}
        // The travel distance lives with what it animates.
        style={{ ["--width" as string]: `${width}` }}
      >
        {[0, 1].map((copy) => (
          <g key={copy} transform={`translate(${copy * width} 0)`}>
            <use href="#land" className={styles.land} />

            {CITIES.map((city) => {
              const point = toGridCell(city.lon, city.lat);
              const cx = point.x * STEP + STEP / 2;
              const cy = point.y * STEP + STEP / 2;
              const key = `${copy}-${city.lon}-${city.lat}`;
              const delay = { animationDelay: `${city.delay}s` };

              // Two circles and NO filter: see the stylesheet.
              return (
                <g key={key}>
                  <circle
                    className={styles.halo}
                    cx={cx}
                    cy={cy}
                    r={R * 2.6}
                    style={delay}
                  />
                  <circle
                    className={styles.city}
                    cx={cx}
                    cy={cy}
                    r={R}
                    style={delay}
                  />
                </g>
              );
            })}
          </g>
        ))}
      </g>
    </svg>
  );
}
