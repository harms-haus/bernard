/**
 * Home Assistant Color Utilities
 *
 * Provides color conversion and management utilities for Home Assistant lights.
 * Supports multiple color formats: RGB, HS, XY, RGBW, and color temperature (Kelvin).
 * Includes a comprehensive color name database for common colors.
 */

/**
 * Color space representations
 */
export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface RGBWColor extends RGBColor {
  w: number; // 0-255 (white channel)
}

export interface HSColor {
  h: number; // 0-360 (hue in degrees)
  s: number; // 0-100 (saturation as percentage)
}

export interface XYColor {
  x: number; // 0-1 (CIE 1931 x coordinate)
  y: number; // 0-1 (CIE 1931 y coordinate)
}

export interface ColorTemp {
  kelvin: number; // color temperature in Kelvin
}

/**
 * Union type for all supported color input formats
 */
export type ColorInput = RGBColor | RGBWColor | HSColor | XYColor | ColorTemp | string | number;

/**
 * Color data structure with all representations
 */
export interface ColorData {
  name?: string;
  rgb: RGBColor;
  hs: HSColor;
  xy: XYColor;
  kelvin?: number;
}

/**
 * Comprehensive color name database
 * Contains common colors with their RGB, HS, XY, and Kelvin representations
 */
const COLOR_DATABASE: Record<string, ColorData> = {
  // Basic colors
  red: {
    name: "red",
    rgb: { r: 255, g: 0, b: 0 },
    hs: { h: 0, s: 100 },
    xy: { x: 0.675, y: 0.322 },
    kelvin: 1500
  },
  green: {
    name: "green",
    rgb: { r: 0, g: 255, b: 0 },
    hs: { h: 120, s: 100 },
    xy: { x: 0.299, y: 0.587 },
    kelvin: 6500
  },
  blue: {
    name: "blue",
    rgb: { r: 0, g: 0, b: 255 },
    hs: { h: 240, s: 100 },
    xy: { x: 0.168, y: 0.041 },
    kelvin: 15000
  },
  yellow: {
    name: "yellow",
    rgb: { r: 255, g: 255, b: 0 },
    hs: { h: 60, s: 100 },
    xy: { x: 0.422, y: 0.476 },
    kelvin: 2700
  },
  orange: {
    name: "orange",
    rgb: { r: 255, g: 165, b: 0 },
    hs: { h: 39, s: 100 },
    xy: { x: 0.556, y: 0.408 },
    kelvin: 2200
  },
  purple: {
    name: "purple",
    rgb: { r: 128, g: 0, b: 128 },
    hs: { h: 300, s: 100 },
    xy: { x: 0.313, y: 0.129 },
    kelvin: 4000
  },
  pink: {
    name: "pink",
    rgb: { r: 255, g: 192, b: 203 },
    hs: { h: 350, s: 25 },
    xy: { x: 0.415, y: 0.302 },
    kelvin: 3500
  },

  // Whites and temperature-based colors
  white: {
    name: "white",
    rgb: { r: 255, g: 255, b: 255 },
    hs: { h: 0, s: 0 },
    xy: { x: 0.333, y: 0.333 },
    kelvin: 6500
  },
  "warm white": {
    name: "warm white",
    rgb: { r: 255, g: 244, b: 229 },
    hs: { h: 37, s: 10 },
    xy: { x: 0.380, y: 0.376 },
    kelvin: 2700
  },
  "cool white": {
    name: "cool white",
    rgb: { r: 208, g: 219, b: 255 },
    hs: { h: 220, s: 19 },
    xy: { x: 0.286, y: 0.295 },
    kelvin: 8000
  },
  "daylight": {
    name: "daylight",
    rgb: { r: 255, g: 255, b: 251 },
    hs: { h: 56, s: 2 },
    xy: { x: 0.331, y: 0.342 },
    kelvin: 5500
  },

  // Extended palette
  cyan: {
    name: "cyan",
    rgb: { r: 0, g: 255, b: 255 },
    hs: { h: 180, s: 100 },
    xy: { x: 0.224, y: 0.328 },
    kelvin: 10000
  },
  magenta: {
    name: "magenta",
    rgb: { r: 255, g: 0, b: 255 },
    hs: { h: 300, s: 100 },
    xy: { x: 0.320, y: 0.154 },
    kelvin: 4500
  },
  lime: {
    name: "lime",
    rgb: { r: 0, g: 255, b: 128 },
    hs: { h: 150, s: 100 },
    xy: { x: 0.264, y: 0.442 },
    kelvin: 6000
  },
  indigo: {
    name: "indigo",
    rgb: { r: 75, g: 0, b: 130 },
    hs: { h: 275, s: 100 },
    xy: { x: 0.208, y: 0.084 },
    kelvin: 5000
  },
  violet: {
    name: "violet",
    rgb: { r: 238, g: 130, b: 238 },
    hs: { h: 300, s: 76 },
    xy: { x: 0.363, y: 0.210 },
    kelvin: 4000
  },
  brown: {
    name: "brown",
    rgb: { r: 165, g: 42, b: 42 },
    hs: { h: 0, s: 75 },
    xy: { x: 0.596, y: 0.358 },
    kelvin: 2000
  },
  gray: {
    name: "gray",
    rgb: { r: 128, g: 128, b: 128 },
    hs: { h: 0, s: 0 },
    xy: { x: 0.333, y: 0.333 },
    kelvin: 6500
  },
  black: {
    name: "black",
    rgb: { r: 0, g: 0, b: 0 },
    hs: { h: 0, s: 0 },
    xy: { x: 0.333, y: 0.333 },
    kelvin: 6500
  }
};

/**
 * Get color data by name (case-insensitive)
 */
export function getColorByName(name: string): ColorData | null {
  const normalizedName = name.toLowerCase().trim();
  return COLOR_DATABASE[normalizedName] || null;
}

/**
 * Get all available color names
 */
export function getColorNames(): string[] {
  return Object.keys(COLOR_DATABASE);
}

/**
 * Detect the format of color input
 */
export function detectColorFormat(color: ColorInput): 'rgb' | 'rgbw' | 'hs' | 'xy' | 'kelvin' | 'name' | 'unknown' {
  if (typeof color === 'string') {
    return 'name';
  }

  if (typeof color === 'number') {
    return 'kelvin';
  }

  if (typeof color === 'object' && color !== null) {
    // Check for RGBW (has r, g, b, w)
    if ('r' in color && 'g' in color && 'b' in color && 'w' in color) {
      return 'rgbw';
    }
    // Check for RGB (has r, g, b)
    if ('r' in color && 'g' in color && 'b' in color) {
      return 'rgb';
    }
    // Check for HS (has h, s)
    if ('h' in color && 's' in color) {
      return 'hs';
    }
    // Check for XY (has x, y)
    if ('x' in color && 'y' in color) {
      return 'xy';
    }
  }

  return 'unknown';
}

/**
 * Convert RGB to HS (Hue/Saturation)
 */
export function rgbToHs(rgb: RGBColor): HSColor {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : Math.round((delta / max) * 100);

  return { h, s };
}

/**
 * Convert HS to RGB
 */
export function hsToRgb(hs: HSColor): RGBColor {
  const h = hs.h / 360;
  const s = hs.s / 100;

  const c = 1 - Math.abs(2 * 0.5 - 1); // v = 1 (full brightness)
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = 0.5 - c / 2;

  let r = 0, g = 0, b = 0;

  if (0 <= h && h < 1/6) {
    r = c; g = x; b = 0;
  } else if (1/6 <= h && h < 2/6) {
    r = x; g = c; b = 0;
  } else if (2/6 <= h && h < 3/6) {
    r = 0; g = c; b = x;
  } else if (3/6 <= h && h < 4/6) {
    r = 0; g = x; b = c;
  } else if (4/6 <= h && h < 5/6) {
    r = x; g = 0; b = c;
  } else if (5/6 <= h && h < 1) {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

/**
 * Convert RGB to XY (CIE 1931 color space)
 */
export function rgbToXy(rgb: RGBColor): XYColor {
  // Apply gamma correction
  const r = rgb.r > 0.04045 ? Math.pow((rgb.r / 255 + 0.055) / 1.055, 2.4) : rgb.r / 255 / 12.92;
  const g = rgb.g > 0.04045 ? Math.pow((rgb.g / 255 + 0.055) / 1.055, 2.4) : rgb.g / 255 / 12.92;
  const b = rgb.b > 0.04045 ? Math.pow((rgb.b / 255 + 0.055) / 1.055, 2.4) : rgb.b / 255 / 12.92;

  // Convert to XYZ
  const x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = r * 0.0193 + g * 0.1192 + b * 0.9505;

  // Convert to xy
  const total = x + y + z;
  if (total === 0) {
    return { x: 0.333, y: 0.333 }; // Default to white point
  }

  return {
    x: Math.max(0, Math.min(1, x / total)),
    y: Math.max(0, Math.min(1, y / total))
  };
}

/**
 * Convert XY to RGB (approximate)
 */
export function xyToRgb(xy: XYColor): RGBColor {
  const x = xy.x;
  const y = xy.y;

  // Convert to XYZ
  const z = 1 - x - y;
  const Y = 1; // Assume full brightness
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  // Convert to RGB
  let r = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  let g = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  let b = X * 0.0557 + Y * -0.2040 + Z * 1.0570;

  // Apply reverse gamma correction
  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : r * 12.92;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : g * 12.92;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : b * 12.92;

  return {
    r: Math.max(0, Math.min(255, Math.round(r * 255))),
    g: Math.max(0, Math.min(255, Math.round(g * 255))),
    b: Math.max(0, Math.min(255, Math.round(b * 255)))
  };
}

/**
 * Convert color temperature (Kelvin) to RGB (approximate)
 * Based on the algorithm by Mitchell Charity
 */
export function kelvinToRgb(kelvin: number): RGBColor {
  const temp = kelvin / 100;

  let r, g, b;

  // Red
  if (temp <= 66) {
    r = 255;
  } else {
    r = temp - 60;
    r = 329.698727446 * Math.pow(r, -0.1332047592);
    r = Math.max(0, Math.min(255, r));
  }

  // Green
  if (temp <= 66) {
    g = temp;
    g = 99.4708025861 * Math.log(g) - 161.1195681661;
    g = Math.max(0, Math.min(255, g));
  } else {
    g = temp - 60;
    g = 288.1221695283 * Math.pow(g, -0.0755148492);
    g = Math.max(0, Math.min(255, g));
  }

  // Blue
  if (temp >= 66) {
    b = 255;
  } else {
    if (temp <= 19) {
      b = 0;
    } else {
      b = temp - 10;
      b = 138.5177312231 * Math.log(b) - 305.0447927307;
      b = Math.max(0, Math.min(255, b));
    }
  }

  return {
    r: Math.round(r),
    g: Math.round(g),
    b: Math.round(b)
  };
}

/**
 * Convert RGB to approximate color temperature (Kelvin)
 */
export function rgbToKelvin(rgb: RGBColor): number {
  // Simple approximation - find closest match from color database
  let closestKelvin = 6500; // default to daylight
  let minDistance = Infinity;

  for (const color of Object.values(COLOR_DATABASE)) {
    if (color.kelvin) {
      const distance = Math.sqrt(
        Math.pow(rgb.r - color.rgb.r, 2) +
        Math.pow(rgb.g - color.rgb.g, 2) +
        Math.pow(rgb.b - color.rgb.b, 2)
      );

      if (distance < minDistance) {
        minDistance = distance;
        closestKelvin = color.kelvin;
      }
    }
  }

  return closestKelvin;
}

/**
 * Convert any color input to the entity's supported format
 */
export function convertColorToSupportedFormat(
  color: ColorInput,
  supportedModes: string[]
): Record<string, unknown> | null {
  const format = detectColorFormat(color);

  // Handle color name - convert to RGB first
  if (format === 'name' && typeof color === 'string') {
    const colorData = getColorByName(color);
    if (!colorData) {
      throw new Error(`Unknown color name: ${color}`);
    }
    return convertColorToSupportedFormat(colorData.rgb, supportedModes);
  }

  // Handle direct Kelvin input
  if (format === 'kelvin' && typeof color === 'number') {
    if (supportedModes.includes('color_temp_kelvin')) {
      return { color_temp_kelvin: color };
    }
    // Convert to RGB and try again
    const rgb = kelvinToRgb(color);
    return convertColorToSupportedFormat(rgb, supportedModes);
  }

  // Convert to RGB first for processing
  let rgb: RGBColor;

  switch (format) {
    case 'rgb':
    case 'rgbw':
      rgb = color as RGBColor;
      break;
    case 'hs':
      rgb = hsToRgb(color as HSColor);
      break;
    case 'xy':
      rgb = xyToRgb(color as XYColor);
      break;
    default:
      return null;
  }

  // Try to use the most appropriate supported format
  // Priority: RGB > RGBW > HS > XY > Color Temp

  if (supportedModes.includes('rgb') && format === 'rgb') {
    return { rgb_color: [rgb.r, rgb.g, rgb.b] };
  }

  if (supportedModes.includes('rgbw') && format === 'rgbw') {
    const rgbw = color as RGBWColor;
    return { rgbw_color: [rgbw.r, rgbw.g, rgbw.b, rgbw.w] };
  }

  if (supportedModes.includes('hs')) {
    const hs = rgbToHs(rgb);
    return { hs_color: [hs.h, hs.s] };
  }

  if (supportedModes.includes('xy')) {
    const xy = rgbToXy(rgb);
    return { xy_color: [xy.x, xy.y] };
  }

  if (supportedModes.includes('rgb')) {
    return { rgb_color: [rgb.r, rgb.g, rgb.b] };
  }

  if (supportedModes.includes('color_temp_kelvin')) {
    const kelvin = rgbToKelvin(rgb);
    return { color_temp_kelvin: kelvin };
  }

  // No supported format found
  return null;
}

/**
 * Get example color names for tool description
 */
export function getExampleColorNames(): string[] {
  return ['red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'white', 'warm white', 'cool white'];
}
