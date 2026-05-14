type Props = {
  title: string;
  description?: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, description, actions }: Props) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-1.5 text-[15px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
