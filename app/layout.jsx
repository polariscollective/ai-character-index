/* The application's shell. The public reader is static files and does not pass
   through here; what does is the portal and its sign-in page. */
import "./admin.css";

/* The collective's broken-orbit mark, the same bytes the public pages carry.
   Inline rather than a file so there is one copy of it in the repository. */
const MARK = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><rect width=%2248%22 height=%2248%22 rx=%2210%22 fill=%22%23333D22%22/><g transform=%22translate(24,24) scale(0.84) translate(-24,-24)%22><path d=%22M32 10.14A16 16 0 1 1 16 10.14%22 fill=%22none%22 stroke=%22%23F1EFE3%22 stroke-width=%223.5%22 stroke-linecap=%22round%22/><path d=%22M24 4Q24 23 30.5 23Q24 23 24 32Q24 23 17.5 23Q24 23 24 4Z%22 fill=%22%23F1EFE3%22/></g></svg>";

export const metadata = {
  title: "AI Character Index",
  description: "The index's operating surface.",
  icons: { icon: MARK },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href={"https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600"
                + "&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap"}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
