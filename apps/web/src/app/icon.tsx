import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

function MasksArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#2950FF',
      }}
    >
      <svg width="512" height="512" viewBox="0 0 512 512" fill="none">
        <defs>
          <linearGradient id="bg" x1="128" y1="96" x2="400" y2="416" gradientUnits="userSpaceOnUse">
            <stop stopColor="#44B6FF" />
            <stop offset="1" stopColor="#294DFF" />
          </linearGradient>
          <linearGradient id="rearMask" x1="286" y1="146" x2="388" y2="318" gradientUnits="userSpaceOnUse">
            <stop stopColor="#78C6FF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#5A79FF" stopOpacity="0.58" />
          </linearGradient>
          <linearGradient id="frontMask" x1="170" y1="152" x2="286" y2="332" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F5FF" />
          </linearGradient>
          <filter id="shadow" x="108" y="116" width="304" height="284" filterUnits="userSpaceOnUse">
            <feOffset dy="12" />
            <feGaussianBlur stdDeviation="14" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.121569 0 0 0 0 0.227451 0 0 0 0 0.690196 0 0 0 0.18 0"
            />
            <feBlend in2="SourceGraphic" result="shape" />
          </filter>
        </defs>

        <rect x="0" y="0" width="512" height="512" rx="116" fill="url(#bg)" />
        <rect
          x="0.5"
          y="0.5"
          width="511"
          height="511"
          rx="115.5"
          stroke="rgba(255,255,255,0.16)"
        />
        <circle cx="214" cy="134" r="132" fill="rgba(120, 198, 255, 0.22)" />

        <g opacity="0.96">
          <path
            d="M290 151c42-8 86-3 118 10 11 4 17 16 16 27l-12 104c-2 21-13 40-31 51-19 12-44 17-72 12-28-5-49-18-61-35-11-15-16-34-14-54l11-96c2-10 10-17 20-19 8-1 16-1 25 0z"
            fill="url(#rearMask)"
          />
          <path
            d="M334 210c8-13 28-12 43 2 4 4 10 5 15 3 3-1 6 3 3 6-14 19-37 22-54 8-7-6-11-13-7-19z"
            fill="#3159F4"
            opacity="0.9"
          />
          <path
            d="M315 271c18-15 52-15 71 0 5 4 2 11-4 12-18 4-42 4-63 0-8-2-10-9-4-12z"
            fill="#3159F4"
            opacity="0.58"
          />
        </g>

        <g filter="url(#shadow)">
          <path
            d="M165 163c40 9 81 1 110-13 12-6 26 1 29 14l26 102c5 20 0 41-13 58-15 19-38 33-66 37-29 5-54-2-73-16-17-13-29-31-34-51l-24-93c-2-10 3-20 12-26 9-6 20-9 33-12z"
            fill="url(#frontMask)"
          />
          <path
            d="M184 237c12-13 31-17 48-11 8 3 12 12 8 17-3 5-10 3-16 2-11-3-23 0-33 8-5 4-12-1-7-7z"
            fill="#3159F4"
          />
          <path
            d="M261 228c13-12 32-15 48-8 8 3 11 12 7 17-4 5-11 3-16 1-12-4-24-2-34 5-5 4-11-1-5-7z"
            fill="#3159F4"
          />
          <path
            d="M194 286c23-12 60-12 84 0 8 4 7 14-1 19-24 14-59 14-83 0-9-5-9-15 0-19z"
            fill="#3159F4"
          />
        </g>
      </svg>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<MasksArtwork />, size);
}
