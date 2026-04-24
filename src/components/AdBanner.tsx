interface AdBannerProps {
  label?: string;
  className?: string;
  height?: string;
}

/**
 * Placeholder slot for advertising banners.
 * Replace the inner content with your ad provider snippet (e.g., Google AdSense).
 */
export function AdBanner({ label = "Advertisement", className = "", height = "h-24" }: AdBannerProps) {
  return (
    <div
      className={`flex ${height} w-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 text-xs uppercase tracking-widest text-muted-foreground ${className}`}
      data-ad-slot
    >
      {label}
    </div>
  );
}