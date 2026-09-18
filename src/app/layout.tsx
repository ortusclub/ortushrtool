import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

/* Trinity brand faces (brand book p13). Both are self-hosted — neither is on
   Google Fonts. General Sans is Fontshare/ITF Free Font License; the licence
   text ships alongside the files in ./fonts/GeneralSans-LICENSE.txt. */

// UI face. One variable file covers 200-700, which spans every weight the app
// actually uses (font-normal through font-bold) in a single 38KB request.
const generalSans = localFont({
  src: [
    {
      path: "./fonts/GeneralSans-Variable.woff2",
      weight: "200 700",
      style: "normal",
    },
    {
      path: "./fonts/GeneralSans-VariableItalic.woff2",
      weight: "200 700",
      style: "italic",
    },
  ],
  variable: "--font-general-sans",
  display: "swap",
});

// Display face — headings and the wordmark only. Single weight, .otf only.
const maragsa = localFont({
  src: "./fonts/MaragsaDisplay.otf",
  weight: "400",
  style: "normal",
  variable: "--font-maragsa",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trinity HR Platform",
  description: "Employee schedule and attendance management system",
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${maragsa.variable} font-sans h-full`}
      suppressHydrationWarning
    >
      <head>
        {/* Apply the saved/system theme before paint to avoid a flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full bg-gray-50" suppressHydrationWarning>{children}</body>
    </html>
  );
}
