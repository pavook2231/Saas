import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

function TheatreSmileArtwork() {
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
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none">
        <defs>
          <linearGradient id="bg" x1="78" y1="64" x2="432" y2="448" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8b1f52" />
            <stop offset="0.52" stopColor="#412e8f" />
            <stop offset="1" stopColor="#141b38" />
          </linearGradient>
          <linearGradient id="curtain" x1="58" y1="40" x2="184" y2="260" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff6b6b" />
            <stop offset="1" stopColor="#d7264e" />
          </linearGradient>
          <linearGradient id="curtainRight" x1="332" y1="44" x2="452" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ff8b7d" />
            <stop offset="1" stopColor="#cf244f" />
          </linearGradient>
          <linearGradient id="mask" x1="152" y1="128" x2="342" y2="344" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffe8b7" />
            <stop offset="1" stopColor="#ffc66d" />
          </linearGradient>
          <linearGradient id="spot" x1="226" y1="124" x2="302" y2="290" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fff8df" />
            <stop offset="1" stopColor="#ffd489" />
          </linearGradient>
          <filter id="shadow" x="86" y="88" width="340" height="348" filterUnits="userSpaceOnUse">
            <feOffset dy="18" />
            <feGaussianBlur stdDeviation="18" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.0705882 0 0 0 0 0.0901961 0 0 0 0 0.235294 0 0 0 0.26 0"
            />
            <feBlend in2="SourceGraphic" result="shape" />
          </filter>
        </defs>

        <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="511" height="511" rx="115.5" stroke="rgba(255,255,255,0.14)" />

        <path
          d="M74 64c26 8 50 30 62 62 9 27 13 61 9 104-4 40-15 76-35 105-10-20-18-43-23-68-13-67-17-131-13-203z"
          fill="url(#curtain)"
        />
        <path
          d="M438 64c-26 8-50 30-62 62-9 27-13 61-9 104 4 40 15 76 35 105 10-20 18-43 23-68 13-67 17-131 13-203z"
          fill="url(#curtainRight)"
        />
        <path d="M132 82h248" stroke="rgba(255,217,160,0.72)" strokeWidth="14" strokeLinecap="round" />
        <circle cx="256" cy="108" r="18" fill="#ffd37c" />

        <g filter="url(#shadow)">
          <path
            d="M256 132c73 0 132 59 132 132s-59 132-132 132-132-59-132-132 59-132 132-132z"
            fill="url(#mask)"
          />
          <ellipse cx="238" cy="224" rx="80" ry="90" fill="url(#spot)" opacity="0.76" />
          <circle cx="208" cy="232" r="18" fill="#4f244e" />
          <circle cx="304" cy="232" r="18" fill="#4f244e" />
          <path
            d="M194 314c18 30 50 45 84 45 34 0 66-15 84-45"
            stroke="#4f244e"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M174 198c16-18 34-27 54-27 20 0 38 9 54 27"
            stroke="#7f2a56"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M284 198c16-18 34-27 54-27 8 0 16 1 24 4"
            stroke="#7f2a56"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M206 150c18 8 34 8 50 0"
            stroke="rgba(255,255,255,0.62)"
            strokeWidth="10"
            strokeLinecap="round"
          />
        </g>

        <circle cx="142" cy="386" r="16" fill="rgba(255,214,129,0.22)" />
        <circle cx="376" cy="150" r="22" fill="rgba(255,214,129,0.16)" />
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<TheatreSmileArtwork />, size);
}
