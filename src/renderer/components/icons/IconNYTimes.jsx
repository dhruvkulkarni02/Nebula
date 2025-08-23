import React from 'react';

export default function IconNYTimes({ size = 36, variant = 'filled' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#0f172a" />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontFamily="Georgia,serif" fontSize="12" fill="#fff">NY</text>
    </svg>
  );
}
