import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

function IconArtwork() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#16243d',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: 344,
          height: 388,
          borderRadius: 44,
          background: '#fff8ec',
          border: '8px solid rgba(243, 211, 138, 0.28)',
          boxShadow: '0 24px 40px rgba(7, 15, 31, 0.28)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 88,
            background: '#b33a4a',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 24,
            left: 68,
            width: 28,
            height: 28,
            borderRadius: 999,
            background: '#f3d38a',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 24,
            right: 68,
            width: 28,
            height: 28,
            borderRadius: 999,
            background: '#f3d38a',
          }}
        />

        <div
          style={{
            position: 'absolute',
            top: 128,
            left: 40,
            right: 40,
            bottom: 40,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              style={{
                width: 80,
                height: index < 6 ? 80 : 52,
                borderRadius: 16,
                background: index === 4 ? '#dce6ff' : '#ffffff',
                border: `4px solid ${index === 4 ? '#2d63ea' : 'rgba(22, 36, 61, 0.10)'}`,
                boxShadow:
                  index === 4 ? 'inset 0 0 0 2px rgba(255,255,255,0.45)' : 'none',
              }}
            />
          ))}
        </div>

        <div
          style={{
            position: 'absolute',
            top: 192,
            left: 156,
            width: 160,
            height: 22,
            borderRadius: 999,
            background: '#2d63ea',
            opacity: 0.92,
          }}
        />
      </div>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<IconArtwork />, size);
}
