const patterns: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
  "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
  "8": "wnnwnnwnn", "9": "nnwwnnwnn", A: "wnnnnwnnw", B: "nnwnnwnnw",
  C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn",
  K: "wnnnnnnww", L: "nnwnnnnww", M: "wnwnnnnwn", N: "nnnnwnnww",
  O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw",
  W: "wwwnnnnnn", X: "nwnnwnnnw", Y: "wwnnwnnnn", Z: "nwwnwnnnn",
  "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
  "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

export function Code39Barcode({ value, height = 58 }: { value: string; height?: number }) {
  const encoded = `*${value.toUpperCase().replace(/[^0-9A-Z. $/+%-]/g, "-")}*`;
  const bars: Array<{ x: number; width: number }> = [];
  const quietZone = 10;
  let x = quietZone;

  for (const character of encoded) {
    const pattern = patterns[character];
    pattern.split("").forEach((size, index) => {
      const width = size === "w" ? 3 : 1;
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
    x += 1;
  }

  return (
    <svg
      aria-label={`Barcode ${value}`}
      className="block w-full"
      height={height}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${x + quietZone} ${height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect width={x + quietZone} height={height} fill="white" />
      {bars.map((bar, index) => (
        <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height={height} fill="black" />
      ))}
    </svg>
  );
}
