# Bernard UI

A modern React + Vite + Radix-UI project with Tailwind CSS styling.

## Features

- **Frontend**
  - React 18 with TypeScript
  - Vite build tool
  - React Router for navigation
  - Tailwind CSS for styling

- **UI Components**
  - Radix-UI primitives
  - Accessible components
  - Headless components
  - Custom styling with Tailwind
  - AlertDialog component for confirmations, informational messages, warnings, etc.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser and navigate to `http://localhost:5173`

## Usage

### AlertDialog Component

The AlertDialog component provides a flexible dialog system for various use cases:

```tsx
import React, { useState } from 'react';
import { AlertDialog } from './components/ui/dialog';

function MyComponent() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button onClick={() => setOpen(true)}>
        Delete Item
      </button>
      
      <AlertDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete Item"
        description="Are you sure you want to delete this item?"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => {
          // Handle confirmation
          setOpen(false);
        }}
        variant="warning"
        confirmVariant="destructive"
      />
    </>
  );
}
```

### Dialog Variants

The AlertDialog supports different variants:
- `default` - Standard dialog
- `success` - Success messages (green icon)
- `warning` - Warning messages (yellow icon)
- `error` - Error messages (red icon)
- `info` - Informational messages (blue icon)

### Dialog Manager

For more complex dialog management, use the DialogManager:

```tsx
import { DialogManagerProvider, useConfirmDialog, useAlertDialog } from './components/DialogManager';

function App() {
  return (
    <DialogManagerProvider>
      <YourApp />
    </DialogManagerProvider>
  );
}

function MyComponent() {
  const confirm = useConfirmDialog();
  const alert = useAlertDialog();

  const handleDelete = () => {
    confirm({
      title: 'Delete Item',
      description: 'Are you sure?',
      confirmVariant: 'destructive',
      onConfirm: () => {
        // Handle deletion
      }
    });
  };

  const handleError = () => {
    alert({
      title: 'Error',
      description: 'Something went wrong.',
      variant: 'error'
    });
  };

  return (
    <div>
      <button onClick={handleDelete}>Delete</button>
      <button onClick={handleError}>Show Error</button>
    </div>
  );
}
```

## Next Steps

This is a foundation project. You can now:

- Add more Radix-UI components
- Implement your application features
- Add state management (e.g., Zustand, Redux)
- Connect to APIs
- Add more pages and components