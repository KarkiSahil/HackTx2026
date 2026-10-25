export default function EmptyState({ icon: Icon, message, action, onAction }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-line bg-glass px-6 py-12 text-center">
      {Icon && (
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-lamp/10 text-lamp">
          <Icon className="h-6 w-6" strokeWidth={1.75} />
        </span>
      )}
      <p className="max-w-xs text-sm text-fg-2">{message}</p>
      {action && (
        <button
          onClick={onAction}
          className="mt-1 rounded-xl btn-lamp px-5 py-2.5 text-sm font-semibold transition-colors "
        >
          {action}
        </button>
      )}
    </div>
  );
}
