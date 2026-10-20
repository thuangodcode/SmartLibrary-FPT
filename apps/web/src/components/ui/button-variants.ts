import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl font-semibold text-sm transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 before:transition-opacity hover:scale-[1.02] hover:shadow-primary/30 hover:shadow-xl hover:before:opacity-100 active:scale-[0.98]",
        destructive:
          "bg-gradient-to-br from-destructive via-destructive to-destructive/80 text-destructive-foreground shadow-destructive/25 shadow-lg before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 before:transition-opacity hover:scale-[1.02] hover:shadow-destructive/30 hover:shadow-xl hover:before:opacity-100 active:scale-[0.98]",
        outline:
          "border-2 border-input bg-background/50 shadow-sm backdrop-blur-sm hover:scale-[1.02] hover:border-accent hover:bg-accent hover:text-accent-foreground hover:shadow-md active:scale-[0.98]",
        secondary:
          "bg-gradient-to-br from-secondary via-secondary to-secondary/80 text-secondary-foreground shadow-lg shadow-secondary/25 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 before:transition-opacity hover:scale-[1.02] hover:shadow-secondary/30 hover:shadow-xl hover:before:opacity-100 active:scale-[0.98]",
        ghost:
          "backdrop-blur-sm hover:scale-[1.02] hover:bg-accent/80 hover:text-accent-foreground active:scale-[0.98]",
        link: "text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline",
        shimmer:
          "relative animate-shimmer border border-slate-800/50 bg-[length:200%_100%] bg-[linear-gradient(110deg,#000103,45%,#1e2631,55%,#000103)] text-white shadow-2xl shadow-primary/30 before:absolute before:inset-0 before:translate-x-[-200%] before:animate-shimmer-slide before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent hover:scale-[1.02] hover:shadow-primary/50 active:scale-[0.98]",
        glow: "relative animate-gradient-x bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-500/50 before:absolute before:inset-[-2px] before:-z-10 before:rounded-xl before:bg-gradient-to-r before:from-violet-600 before:via-purple-600 before:to-fuchsia-600 before:opacity-75 before:blur-md hover:scale-[1.02] hover:shadow-2xl hover:shadow-purple-500/60 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 rounded-lg px-4 text-xs",
        lg: "h-12 rounded-xl px-10 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
