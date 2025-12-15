import * as React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';

export function Login() {
  const { state, githubLogin, googleLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    if (provider === 'github') {
      githubLogin();
    } else {
      googleLogin();
    }
  };

  // If user is already logged in, redirect.
  // Do this in an effect to avoid navigation during render.
  React.useEffect(() => {
    if (state.user) {
      navigate(from, { replace: true });
    }
  }, [state.user, navigate, from]);

  if (state.user) {
    return null;
  }

  return (
         <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
         <div>
           <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
             Sign in to Bernard
           </h2>
           <p className="mt-2 text-center text-sm text-muted-foreground">
             Choose your preferred authentication method
           </p>
         </div>
         
         {/* OAuth buttons */}
         <div className="space-y-4">
           <div className="text-center text-sm text-muted-foreground">
             Sign in with
           </div>
           <div className="grid grid-cols-2 gap-3">
             <button
               type="button"
               onClick={() => handleOAuthLogin('github')}
               className="w-full inline-flex justify-center py-2 px-4 border border-border rounded-md shadow-sm bg-card text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
             >
               <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M12 0.297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385 0.601 0.11 0.82-0.254 0.82-0.567 0-0.285-0.01-1.04-0.015-2.04-3.338 0.724-4.042-1.61-4.042-1.61-0.546-1.387-1.333-1.756-1.333-1.756-1.09-0.745 0.082-0.729 0.082-0.729 1.205 0.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495 0.998 0.108-0.776 0.417-1.305 0.76-1.605-2.665-0.3-5.466-1.332-5.466-5.93 0-1.31 0.465-2.38 1.235-3.22-0.135-0.303-0.54-1.523 0.105-3.176 0 0 1.005-0.322 3.3 1.23 0.96-0.267 1.98-0.399 3-0.405 1.02 0.006 2.04 0.138 3 0.405 2.28-1.552 3.285-1.23 3.285-1.23 0.645 1.653 0.24 2.873 0.12 3.176 0.765 0.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92 0.42 0.36 0.81 1.096 0.81 2.22 0 1.606-0.015 2.896-0.015 3.286 0 0.315 0.21 0.69 0.825 0.56C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
               </svg>
               GitHub
             </button>
             <button
               type="button"
               onClick={() => handleOAuthLogin('google')}
               className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
             >
               <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                 <path d="M22.56 12.25c0-1.78-.91-3.25-2.34-4.17l1.45-1.45C23.14 8.26 24 10.51 24 12.25c0 6.25-5.12 11.37-11.38 11.37S1.25 18.5 1.25 12.25c0-1.74.89-3.99 2.33-5.63l1.45 1.45C3.91 9.01 3.25 10.56 3.25 12.25c0 5.18 4.22 9.38 9.25 9.38 5.03 0 9.25-4.2 9.25-9.38 0-1.69-.66-3.24-1.75-4.33L22.56 12.25z"/>
               </svg>
               Google
             </button>
           </div>
         </div>
         
         {state.error && (
           <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
             {state.error}
           </div>
         )}
       </div>
     </div>
  );
}