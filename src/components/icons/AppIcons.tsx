export type AppIconName = 'hq' | 'market' | 'portfolio' | 'intel' | 'review' | 'risk' | 'menu' | 'settings' | 'scanner';

export interface AppIconProps {
  name: AppIconName;
  size?: number;
}

export function AppIcon({ name, size = 18 }: AppIconProps): JSX.Element {
  let path: JSX.Element;
  switch (name) {
    case 'hq':
      path = <><path d="M3 10.5 10 4l7 6.5" /><path d="M5 9.5V17h10V9.5M8 17v-4h4v4" /></>;
      break;
    case 'market':
      path = <><path d="M3 15.5 7 11l3 2 5-7" /><path d="M12 6h3v3" /></>;
      break;
    case 'portfolio':
      path = <><rect x="3" y="6" width="14" height="10" rx="1.5" /><path d="M7 6V4.5h6V6M3 10h14M8 10v2h4v-2" /></>;
      break;
    case 'intel':
      path = <><circle cx="8" cy="8" r="4" /><path d="m11 11 4.5 4.5M8 6v4M6 8h4" /></>;
      break;
    case 'review':
      path = <><path d="M5 3h7l3 3v11H5z" /><path d="M12 3v4h3M7.5 10h5M7.5 13h5" /></>;
      break;
    case 'risk':
      path = <><path d="m10 3 7 13H3z" /><path d="M10 8v3M10 13.5v.1" /></>;
      break;
    case 'menu':
      path = <><path d="M4 5h12M4 10h12M4 15h12" /></>;
      break;
    case 'settings':
      path = <><circle cx="10" cy="10" r="2.5" /><path d="m10 2 .7 1.9 2 .8 1.9-.7 1.4 1.4-.7 1.9.8 2L18 10l-1.9.7-.8 2 .7 1.9-1.4 1.4-1.9-.7-2 .8L10 18l-.7-1.9-2-.8-1.9.7L4 15.6l.7-1.9-.8-2L2 11l1.9-.7.8-2L4 6.4 5.4 5l1.9.7 2-.8z" /></>;
      break;
    case 'scanner':
      path = <><circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4M6.5 8.5h4M8.5 6.5v4" /></>;
      break;
    default:
      path = <circle cx="10" cy="10" r="6" />;
  }
  return (
    <svg className="app-icon" width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {path}
    </svg>
  );
}
