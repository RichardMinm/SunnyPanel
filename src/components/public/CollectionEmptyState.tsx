type CollectionEmptyStateProps = {
  body: string;
  title: string;
};

export function CollectionEmptyState({ body, title }: CollectionEmptyStateProps) {
  return (
    <div className="sunny-panel rounded-[1.45rem] border-dashed px-5 py-5 text-muted md:rounded-[1.7rem] md:px-6">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-7">{body}</p>
    </div>
  );
}
