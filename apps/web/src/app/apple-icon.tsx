import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

function AppleTheatreCalendarArtwork() {
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
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
        <defs>
          <linearGradient id="bg" x1="24" y1="18" x2="154" y2="164" gradientUnits="userSpaceOnUse">
            <stop stopColor="#9d224f" />
            <stop offset="0.5" stopColor="#4c2d95" />
            <stop offset="1" stopColor="#15203d" />
          </linearGradient>
          <linearGradient id="sheet" x1="40" y1="42" x2="138" y2="142" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff8ea" />
            <stop offset="1" stopColor="#ffe1a5" />
          </linearGradient>
          <linearGradient id="sheetTop" x1="40" y1="42" x2="140" y2="76" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff7e76" />
            <stop offset="1" stopColor="#d62857" />
          </linearGradient>
          <linearGradient id="curtainLeft" x1="12" y1="28" x2="50" y2="98" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff8b72" />
            <stop offset="1" stopColor="#d42657" />
          </linearGradient>
          <linearGradient id="curtainRight" x1="130" y1="28" x2="168" y2="98" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff9f86" />
            <stop offset="1" stopColor="#d42657" />
          </linearGradient>
          <linearGradient id="mask" x1="66" y1="74" x2="114" y2="124" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff7dc" />
            <stop offset="1" stopColor="#ffcf7a" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="180" height="180" rx="40" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="179" height="179" rx="39.5" stroke="rgba(255,255,255,0.16)" />

        <path
          d="M16 30c9 3 18 10 23 21 5 8 7 20 7 34 0 13-3 25-8 36-8-9-14-22-18-37-4-20-6-38-4-54z"
          fill="url(#curtainLeft)"
        />
        <path
          d="M164 30c-9 3-18 10-23 21-5 8-7 20-7 34 0 13 3 25 8 36 8-9 14-22 18-37 4-20 6-38 4-54z"
          fill="url(#curtainRight)"
        />

        <rect x="40" y="42" width="100" height="102" rx="18" fill="url(#sheet)" />
        <rect x="40" y="42" width="100" height="28" rx="18" fill="url(#sheetTop)" />
        <rect x="40" y="56" width="100" height="14" fill="url(#sheetTop)" />
        <rect x="39.5" y="41.5" width="101" height="103" rx="18.5" stroke="rgba(255,255,255,0.26)" />

        <rect x="58" y="30" width="10" height="24" rx="5" fill="#ffd67d" />
        <rect x="112" y="30" width="10" height="24" rx="5" fill="#ffd67d" />
        <rect x="54" y="34" width="18" height="8" rx="4" fill="#fff3d2" />
        <rect x="108" y="34" width="18" height="8" rx="4" fill="#fff3d2" />

        <circle cx="90" cy="95" r="28" fill="url(#mask)" />
        <ellipse cx="84" cy="90" rx="18" ry="20" fill="rgba(255,248,223,0.8)" />
        <circle cx="80" cy="94" r="4.5" fill="#4e264f" />
        <circle cx="101" cy="94" r="4.5" fill="#4e264f" />
        <path d="M75 112c5 8 12 12 21 12 8 0 15-4 20-12" stroke="#4e264f" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M74 80c4-5 9-7 15-7 5 0 10 2 14 7" stroke="#8c2f56" strokeWidth="4" strokeLinecap="round" />
        <path d="M98 80c4-5 9-7 14-7 4 0 6 1 9 2" stroke="#8c2f56" strokeWidth="4" strokeLinecap="round" />

        <path d="M54 64h72" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M58 130h18" stroke="rgba(78,38,79,0.14)" strokeWidth="5" strokeLinecap="round" />
        <path d="M104 130h18" stroke="rgba(78,38,79,0.14)" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleTheatreCalendarArtwork />, size);
}
