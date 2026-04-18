type CollectionEmptyStateProps = {
  body: string;
  title: string;
};

export function CollectionEmptyState({ body, title }: CollectionEmptyStateProps) {
  return (
    <div className="sunny-card rounded-[2rem] border-dashed p-8 text-muted">
      <span className="sunny-badge sunny-badge-muted">Waiting for content</span>
      <h2 className="mt-5 text-2xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 max-w-2xl leading-8">{body}</p>
    </div>
  );
}
