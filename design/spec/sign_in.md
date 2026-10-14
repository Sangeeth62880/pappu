# Screen Specification: Sign In & Create Account

This specification covers the Authentication Screens (Sign In and Create Account) from `design/stitch/sign_in.html`.

## 1. Frame Geometry

- Viewport Width: 390px
- Viewport Height: 844px
- Base Background: `bg` `#FFF8E7`
- Screen Border: 4px solid `ink` `#1F2937`, corner radius 40px
- Side Content Padding: 20px (`px-[20px]`)
- No Header and No Bottom Tab Bar: Authentication views run completely unencumbered by top navigation headers or bottom tab bars

## 2. Element Hierarchy in Order: Sign In Screen

### Element 1: Status Bar
- Height: 47px (`h-[47px]`), horizontal padding 24px, top 12px
- Content: 9:41, cellular, wifi, battery glyphs

### Element 2: Mascot Hero & Branding Block
- Margin Top: 24px
- Layout: Flex col items center text center
- Hero Mascot: 180px diameter (`w-[180px] h-[180px]`), gold coin mascot waving or welcoming
- Wordmark: "Pappu", Baloo Chettan 2 Bold 32px, line height 36px, `ink` `#1F2937`, margin top 12px
- Tagline: "Just say it. Pappu keeps track.", Nunito 15px, line height 22px, `ink_muted` `#6B7280`, margin top 4px
- Prohibited Elements: Tip boxes, encryption badges, AI engine badges, and bilingual labels are strictly banned.

### Element 3: Auth Card
- Margin Top: 28px
- Container: Surface white `#FFFFFF`, 2px solid `border` `#F0E4C8`, radius 20px, padding 24px (`p-6`), full width, flex col gap 16px
- Form Fields:
  1. Email Field:
     - Height: 52px (`h-[52px]`)
     - Background: Surface white `#FFFFFF`
     - Border: 2px solid `border` `#F0E4C8`
     - Corner Radius: 16px (`rounded-[16px]`)
     - Padding: Horizontal 16px
     - Leading Icon: Lucide `mail` (20px, `ink_muted` `#6B7280`)
     - Text / Value: "you@example.com", Nunito 15px Semibold, `ink` `#1F2937`
  2. Password Field:
     - Height: 52px (`h-[52px]`)
     - Background: Surface white `#FFFFFF`
     - Border: 2px solid `border` `#F0E4C8`
     - Corner Radius: 16px
     - Padding: Horizontal 16px
     - Leading Icon: Lucide `lock` (20px, `ink_muted` `#6B7280`)
     - Text / Value: Obscured password bullets "••••••••", Nunito 15px
     - Trailing Action: Lucide `eye` or `eye_off` icon (20px, `ink_muted` `#6B7280`, toggles visibility)
  3. Sign In Button:
     - Width: Full width, height 52px (`h-[52px]`), margin top 8px
     - Variant: Primary Button (`btn-primary`)
     - Fill: `gold` `#FFC83D`
     - Bottom Edge: 4px solid `gold_edge` `#D99A00` (`shadow-[0_4px_0_#D99A00]`)
     - Corner Radius: 16px
     - Label: "Sign in", Baloo Chettan 2 Bold 17px, line height 22px, `ink` `#1F2937`
     - Active State: translateY 4px, bottom edge collapses to 0px over 80ms

### Element 4: Switch Mode Footer
- Margin Top: 24px
- Layout: Flex row items center justify center gap 6px
- Prompt Text: "Don't have an account?", Nunito 14px, `ink_muted` `#6B7280`
- Action Link: "Create account", Baloo Chettan 2 Bold 14px, `teal` `#0E7C86`, cursor pointer

---

## 3. Element Hierarchy in Order: Create Account Screen

- Geometry and Background: Identical to Sign In (390x844 on `#FFF8E7`)
- Status Bar: 47px
- Mascot Hero: 180px mascot, wordmark "Pappu", tagline "Just say it. Pappu keeps track."
- Auth Card Fields:
  1. Name Field:
     - Height: 52px, radius 16px, 2px border `#F0E4C8`, padding x 16px
     - Leading Icon: Lucide `user` (20px, `ink_muted` `#6B7280`)
     - Placeholder: "Your name", Nunito 15px, `ink_muted` `#6B7280`
  2. Email Field:
     - Height: 52px, radius 16px, 2px border `#F0E4C8`, padding x 16px
     - Leading Icon: Lucide `mail` (20px, `ink_muted` `#6B7280`)
     - Placeholder: "you@example.com"
  3. Password Field:
     - Height: 52px, radius 16px, 2px border `#F0E4C8`, padding x 16px
     - Leading Icon: Lucide `lock` (20px, `ink_muted` `#6B7280`)
     - Trailing Icon: Lucide `eye`
     - Placeholder: "Create password (min 6 characters)"
  4. Create Account Button:
     - Width: Full width, height 52px, margin top 8px
     - Fill: `gold` `#FFC83D`, 4px bottom edge `gold_edge` `#D99A00`, radius 16px
     - Label: "Create account", Baloo Chettan 2 Bold 17px, `ink` `#1F2937`
- Switch Mode Footer:
  - Prompt: "Already have an account?", Nunito 14px, `ink_muted` `#6B7280`
  - Action Link: "Sign in", Baloo Chettan 2 Bold 14px, `teal` `#0E7C86`

## 4. Motion and Validation Details

- Input Focus: Border transitions cleanly from 2px `#F0E4C8` to 2px `teal` `#0E7C86`. Mascot pupils angle slightly downward toward the active input field.
- Validation Error: Border turns 2px `expense` `#E5484D`. Mascot gives subtle head shake over 200ms.
