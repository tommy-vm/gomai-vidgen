import "./globals.css";

export const metadata = {
  title: "GOM AI — Image to Video",
  description: "AI-powered image-to-video generation by GOM&Company",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
