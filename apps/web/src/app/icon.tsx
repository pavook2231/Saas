import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

function TheatreCalendarArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#181733',
      }}
    >
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none">
        <defs>
          <linearGradient id="bg" x1="88" y1="64" x2="430" y2="448" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9d224f" />
            <stop offset="0.5" stopColor="#4c2d95" />
            <stop offset="1" stopColor="#15203d" />
          </linearGradient>
          <linearGradient id="sheet" x1="120" y1="126" x2="374" y2="394" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff8ea" />
            <stop offset="1" stopColor="#ffe1a5" />
          </linearGradient>
          <linearGradient id="sheetTop" x1="126" y1="126" x2="388" y2="210" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff7e76" />
            <stop offset="1" stopColor="#d62857" />
          </linearGradient>
          <linearGradient id="curtainLeft" x1="62" y1="92" x2="170" y2="272" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff8b72" />
            <stop offset="1" stopColor="#d42657" />
          </linearGradient>
          <linearGradient id="curtainRight" x1="344" y1="92" x2="452" y2="272" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff9f86" />
            <stop offset="1" stopColor="#d42657" />
          </linearGradient>
          <linearGradient id="mask" x1="179" y1="214" x2="326" y2="354" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff7dc" />
            <stop offset="1" stopColor="#ffcf7a" />
          </linearGradient>
          <filter id="shadow" x="88" y="98" width="336" height="340" filterUnits="userSpaceOnUse">
            <feOffset dy="20" />
            <feGaussianBlur stdDeviation="18" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.0549 0 0 0 0 0.0745 0 0 0 0 0.2 0 0 0 0.26 0"
            />
            <feBlend in2="SourceGraphic" result="shape" />
          </filter>
        </defs>

        <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="511" height="511" rx="115.5" stroke="rgba(255,255,255,0.14)" />

        <path
          d="M68 90c26 8 50 28 64 58 11 24 18 56 18 96 0 36-7 70-22 98-18-24-31-55-39-92-11-55-18-107-21-160z"
          fill="url(#curtainLeft)"
          opacity="0.96"
        />
        <path
          d="M444 90c-26 8-50 28-64 58-11 24-18 56-18 96 0 36 7 70 22 98 18-24 31-55 39-92 11-55 18-107 21-160z"
          fill="url(#curtainRight)"
          opacity="0.96"
        />

        <g filter="url(#shadow)">
          <rect x="118" y="122" width="276" height="286" rx="48" fill="url(#sheet)" />
          <rect x="118" y="122" width="276" height="82" rx="48" fill="url(#sheetTop)" />
          <rect x="118" y="164" width="276" height="40" fill="url(#sheetTop)" />
          <rect x="117.5" y="121.5" width="277" height="287" rx="48.5" stroke="rgba(255,255,255,0.28)" />

          <rect x="170" y="94" width="24" height="70" rx="12" fill="#ffd67d" />
          <rect x="318" y="94" width="24" height="70" rx="12" fill="#ffd67d" />
          <rect x="162" y="104" width="40" height="22" rx="11" fill="#fff3d2" />
          <rect x="310" y="104" width="40" height="22" rx="11" fill="#fff3d2" />

          <circle cx="256" cy="281" r="82" fill="url(#mask)" />
          <ellipse cx="239" cy="266" rx="52" ry="58" fill="rgba(255,248,223,0.78)" />
          <circle cx="226" cy="274" r="12" fill="#4e264f" />
          <circle cx="286" cy="274" r="12" fill="#4e264f" />
          <path
            d="M214 328c14 22 34 33 58 33 24 0 44-11 58-33"
            stroke="#4e264f"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M208 240c10-12 23-18 38-18 14 0 27 6 37 18"
            stroke="#8c2f56"
            strokeWidth="10"
            strokeLinecap="round"
          />
          <path
            d="M274 240c10-12 22-18 36-18 9 0 17 2 24 5"
            stroke="#8c2f56"
            strokeWidth="10"
            strokeLinecap="round"
          />

          <path d="M156 186h200" stroke="rgba(255,255,255,0.42)" strokeWidth="6" strokeLinecap="round" />
          <path d="M176 228h42" stroke="rgba(78,38,79,0.16)" strokeWidth="10" strokeLinecap="round" />
          <path d="M294 228h42" stroke="rgba(78,38,79,0.16)" strokeWidth="10" strokeLinecap="round" />
          <path d="M176 370h44" stroke="rgba(78,38,79,0.14)" strokeWidth="10" strokeLinecap="round" />
          <path d="M292 370h44" stroke="rgba(78,38,79,0.14)" strokeWidth="10" strokeLinecap="round" />
        </g>

        <circle cx="132" cy="402" r="18" fill="rgba(255,214,129,0.18)" />
        <circle cx="380" cy="122" r="24" fill="rgba(255,214,129,0.14)" />
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<TheatreCalendarArtwork />, size);
}
