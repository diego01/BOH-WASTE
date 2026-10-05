import { appIcon } from "@/lib/appIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS applies its own rounded mask, so the square is full-bleed.
export default function AppleIcon() {
  return appIcon(180);
}
