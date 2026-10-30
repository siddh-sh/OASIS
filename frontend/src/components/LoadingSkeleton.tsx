import clsx from 'clsx'

export function LoadingSkeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton-shimmer rounded-md', className)} />
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <LoadingSkeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  )
}
