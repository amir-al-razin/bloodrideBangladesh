// The BloodRide blood drop: a real drop shape (point on top, round at the bottom) with a soft shine.
export default function Drop({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2.2c.35 0 .67.18.86.47C14.9 5.8 19 11.3 19 15.1A7 7 0 0 1 5 15.1C5 11.3 9.1 5.8 11.14 2.67c.19-.29.51-.47.86-.47Z"
            fill="var(--red)" />
      <path d="M8.6 15.4c0 1.7 1.1 3.1 2.6 3.6" stroke="#fff" strokeOpacity=".75" strokeWidth="1.6"
            strokeLinecap="round" fill="none" />
    </svg>
  );
}
