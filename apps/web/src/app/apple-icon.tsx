import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

function AppleMasksArtwork() {
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
      <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
        <defs>
          <linearGradient id="bg" x1="40" y1="26" x2="140" y2="152" gradientUnits="userSpaceOnUse">
            <stop stopColor="#44B6FF" />
            <stop offset="1" stopColor="#294DFF" />
          </linearGradient>
          <linearGradient id="rearMask" x1="100" y1="48" x2="143" y2="117" gradientUnits="userSpaceOnUse">
            <stop stopColor="#78C6FF" stopOpacity="0.95" />
            <stop offset="1" stopColor="#5A79FF" stopOpacity="0.58" />
          </linearGradient>
          <linearGradient id="frontMask" x1="59" y1="50" x2="108" y2="120" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#F1F5FF" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="180" height="180" rx="40" fill="url(#bg)" />
        <rect x="0.5" y="0.5" width="179" height="179" rx="39.5" stroke="rgba(255,255,255,0.16)" />
        <circle cx="74" cy="42" r="44" fill="rgba(120, 198, 255, 0.22)" />

        <path
          d="M102 47c16-3 34-1 46 5 4 2 6 6 6 10l-4 41c-1 9-5 16-12 21-7 5-17 7-28 5-11-2-19-7-24-14-5-6-7-14-6-22l4-38c1-4 4-7 8-8h10z"
          fill="url(#rearMask)"
        />
        <path
          d="M120 70c4-5 11-4 17 1 2 1 4 2 6 1 2-1 3 1 2 2-6 7-15 8-22 3-3-3-5-5-3-7z"
          fill="#3159F4"
          opacity="0.88"
        />
        <path
          d="M113 94c7-5 20-5 28 0 2 2 1 4-1 5-7 1-16 1-25 0-3-1-4-3-2-5z"
          fill="#3159F4"
          opacity="0.58"
        />

        <path
          d="M56 53c17 4 33 1 45-6 5-2 10 0 12 6l10 39c2 8 0 16-5 23-6 7-16 13-28 15-12 2-22 0-30-6-7-5-12-12-14-20l-9-36c-1-4 1-8 5-10 4-2 8-4 14-5z"
          fill="url(#frontMask)"
        />
        <path
          d="M64 82c5-5 12-7 19-4 3 1 5 4 3 6-1 2-4 1-6 1-4-1-9 0-13 3-2 2-5 0-3-2z"
          fill="#3159F4"
        />
        <path
          d="M94 79c5-5 12-6 18-3 3 1 4 4 3 6-2 2-5 1-6 0-5-2-10-1-14 2-2 2-5 0-1-5z"
          fill="#3159F4"
        />
        <path
          d="M68 101c9-5 23-5 33 0 3 2 3 6 0 7-10 6-24 6-33 0-4-1-4-5 0-7z"
          fill="#3159F4"
        />
      </svg>
    </div>
  );
}

export default function AppleIcon() {
  return new ImageResponse(<AppleMasksArtwork />, size);
}
