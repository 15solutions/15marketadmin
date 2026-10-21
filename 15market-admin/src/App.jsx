import React, { Suspense, lazy } from 'react';

const AdminPortal = lazy(() => import('./components/AdminPortal').then(m => ({ default: m.AdminPortal })));

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
                <div style={{ padding: '20px', color: 'red', background: '#330000' }}>
                    <h3>Admin console error:</h3>
                    <pre style={{ overflow: 'auto' }}>{String(this.state.error?.message || this.state.error)}</pre>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function App() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<div style={{ color: '#fff', background: '#050505' }}>loading portal…</div>}>
                <AdminPortal
                    onBack={() => {}}
                    notify={(msg) => console.log('[notify]', msg)}
                />
            </Suspense>
        </ErrorBoundary>
    );
}
