import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, details) {
    console.error('[CareFlow UI]', error, details);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.2em] text-teal-300">CareFlow recovered safely</p>
          <h1 className="mt-3 text-3xl font-bold">This page needs a quick refresh</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">Your saved healthcare data is safe. Refresh to continue.</p>
          <button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-teal-400 px-5 py-3 text-sm font-bold text-slate-950">Refresh page</button>
        </div>
      </div>
    );
  }
}