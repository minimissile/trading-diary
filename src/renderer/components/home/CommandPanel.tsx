interface CommandPanelProps {
  number: string;
  title: string;
  meta?: string;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function CommandPanel({ number, title, meta, extra, className = '', children }: CommandPanelProps): React.JSX.Element {
  return (
    <section className={`command-panel ${className}`} data-panel-number={number}>
      <header className="command-panel-header">
        <h2>
          {title} {meta ? <small>{meta}</small> : null}
        </h2>
        {extra ? <div className="command-panel-extra">{extra}</div> : null}
      </header>
      <div className="command-panel-body">{children}</div>
    </section>
  );
}
