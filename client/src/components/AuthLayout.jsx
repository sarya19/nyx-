export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-ink text-paper p-10">
        <p className="font-mono text-sm tracking-widest uppercase text-mist">Nyx</p>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Code together, without the chaos.</h1>
          <p className="mt-4 max-w-md text-mist">
            A quiet workspace for college labs, pair programming, and late-night assignment sprints.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-mist">
            <li>Share a room link — classmates join after they sign in.</li>
            <li>Type together in one live editor, with who’s online on the side.</li>
            <li>Code autosaves. Run JavaScript and read console output below.</li>
          </ul>
        </div>
        <p className="text-sm text-mist">Live editor · shared rooms · JavaScript run</p>
      </aside>
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <p className="lg:hidden mb-8 font-mono text-sm tracking-widest uppercase">Nyx</p>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="mt-2 text-stone-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-6 text-sm text-stone-600">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
