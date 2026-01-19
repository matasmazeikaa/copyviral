import './globals.css'
import type { Metadata } from 'next'
import { Inter, Roboto_Mono } from "next/font/google";
import { Providers } from './providers'
import Header from "./components/header/Header";
import Footer from "./components/footer/Footer";
import { Toaster } from 'react-hot-toast';
import { Analytics } from "@vercel/analytics/next"

const geistSans = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Roboto_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'CopyViral',
  description: 'Copy viral videos with AI. Automatically analyze and recreate trending video styles, cuts, and pacing.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <meta name="apple-mobile-web-app-title" content="CopyViral" />
      </head>
      <body
        className={`min-h-screen flex flex-col bg-darkSurfacePrimary text-text-primary dark:bg-darkSurfacePrimary dark:text-dark-text-primary font-sans ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <Header />
          <main className="flex-grow pt-16">
            <Toaster
              toastOptions={{
                style: {
                  borderRadius: '10px',
                  background: '#333',
                  color: '#fff',
                },
              }}
            />
            {children}
            <Analytics />
          </main>
          {/* <Footer /> */}
        </Providers>
      </body>
    </html>
  )
}
