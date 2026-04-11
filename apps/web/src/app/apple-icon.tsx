import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

function AppleTheatreSmileArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1f1a3d',
      }}
    >
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
        <defs>
          <linearGradient id="bg" x1="28" y1="22" x2="152" y2="158" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8b1f52" />
            <stop offset="0.52" stopColor="#412e8f" />
            <stop offset="1" stopColor="#141b38" />
          </linearGradient>
          <linearGradient id="curtain" x1="18" y1="18" x2="56" y2="100" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff6b6b" />
            <stop offset="1" stopColor="#d7264e" />
          </linearGradient>
          <linearGradient id="curtainRight" x1="126" y1="18" x2="162" y2="96" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff8b7d" />
            <stop offset="1" stopColor="#cf244f" />
          </linearGradient>
          <linearGradient id="mask" x1="54" y1="48" x2="116" y2="126" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffe8b7" />
            <stop offset="1" stopColor="#ffc66d" />
          </linearGradient>
          <linearGradient id="spot" x1="78" y1="42" x2="106" y2="104" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff8df" />
            <stop offset="1" stopColor="#ffd489" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="180" height="180" rx="40" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="179" height="179" rx="39.5" stroke="rgba(255,255,255,0.16)" />

        <path
          d="M26 24c9 3 17 11 21 22 3 10 4 22 3 38-2 15-6 29-13 40-3-8-6-16-8-26-5-25-6-48-3-74z"
          fill="url(#curtain)"
        />
        <path
          d="M154 24c-9 3-17 11-21 22-3 10-4 22-3 38 2 15 6 29 13 40 3-8 6-16 8-26 5-25 6-48 3-74z"
          fill="url(#curtainRight)"
        />
        <path d="M48 31h84" stroke="rgba(255,217,160,0.72)" strokeWidth="6" strokeLinecap="round" />
        <circle cx="90" cy="42" r="7" fill="#ffd37c" />

        <circle cx="90" cy="94" r="46" fill="url(#mask)" />
        <ellipse cx="84" cy="82" rx="28" ry="32" fill="url(#spot)" opacity="0.78" />
        <circle cx="73" cy="84" r="6.5" fill="#4f244e" />
        <circle cx="108" cy="84" r="6.5" fill="#4f244e" />
        <path
          d="M68 114c6 11 17 16 29 16 12 0 23-5 29-16"
          stroke="#4f244e"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M60 69c6-6 13-10 21-10 8 0 15 4 21 10" stroke="#7f2a56" strokeWidth="5.5" strokeLinecap="round" />
        <path d="M96 69c7-7 15-10 24-10 4 0 7 1 10 2" stroke="#7f2a56" strokeWidth="5.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleTheatreSmileArtwork />, size);
}
