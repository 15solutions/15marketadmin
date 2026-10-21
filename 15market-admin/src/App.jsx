import React, { Suspense, lazy } from 'react';

// The Admin Portal — Supabase Auth identity (email + password), mounted as
// the entire app of this standalone project on port 3001. There is no user
// side here and no route branching: this console is its own deployment.
const AdminPortal = lazy(() => import('./components/AdminPortal'));

// Simple Error Boundary for Lazy Load
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '20px', color: 'red', background: '#330000', borderTop: '1px solid #ff4444', flex: 1, overflow: 'auto' }}>
                        <h3 style={{ margin: 0 }}>Admin console error:</h3>
                        <pre style={{ overflow: 'auto', marginTop: '10px' }}>{this.state.error.toString()}</pre>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    return (
        <ErrorBoundary>
            <Suspense fallback={
                <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050505', color: '#fff' }}>
                    <div className="animate-pulse flex flex-col items-center">
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontFamily: '"Comfortaa", sans-serif' }}>15market Admin</h2>
                        <p style={{ color: '#71717a' }}>Mounting ops console…</p>
                    </div>
                </div>
            }>
                <AdminPortal
                    onBack={() => {}}
                    notify={(msg) => console.log('[notify]', msg)}
                />
            </Suspense>
        </ErrorBoundary>
    );
}
