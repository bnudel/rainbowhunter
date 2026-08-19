// app/layout.js
import "./globals.css";

export const metadata = {
  title: "RainbowHunter",
  description: "A live heatmap of where to stand to see a rainbow.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // respect notches / safe areas
  themeColor: "#0b0f1a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
