import Changes from "./changes";
import ChangelogHeader from "./header";

const DUMMY_LOGS = [
  {
    id: "1",
    title: "Major Performance Improvements",
    publishDate: "2024-03-20",
    summary:
      "We've completely revamped our backend infrastructure, resulting in 50% faster load times.",
    content:
      "## What's New\n\n- Upgraded to Next.js 14\n- Implemented edge caching\n- Reduced bundle size by 30%",
  },
  {
    id: "2",
    title: "New User Interface",
    publishDate: "2024-03-15",
    summary:
      "Complete redesign of our dashboard with improved usability and modern aesthetics.",
    content:
      "## Changes\n\n- New dashboard layout\n- Dark mode support\n- Improved mobile responsiveness",
  },
  {
    id: "3",
    title: "Enhanced Security Features",
    publishDate: "2024-03-10",
    summary:
      "Implemented advanced security measures to better protect user data and prevent unauthorized access.",
    content:
      "## Security Updates\n\n- Two-factor authentication\n- Enhanced encryption protocols\n- Regular security audits",
  },
  {
    id: "4",
    title: "API Version 2.0 Release",
    publishDate: "2024-03-05",
    summary:
      "Major API update with new endpoints and improved documentation for developers.",
    content:
      "## API Changes\n\n- New REST endpoints\n- GraphQL support\n- Updated API documentation",
  },
  {
    id: "5",
    title: "Mobile App Integration",
    publishDate: "2024-02-28",
    summary:
      "Launched native mobile app integration with cross-platform support and offline capabilities.",
    content:
      "## Mobile Features\n\n- iOS and Android support\n- Offline mode\n- Push notifications",
  },
  {
    id: "6",
    title: "Analytics Dashboard",
    publishDate: "2024-02-20",
    summary:
      "Introduced comprehensive analytics dashboard with real-time data visualization.",
    content:
      "## Analytics Features\n\n- Real-time metrics\n- Custom reports\n- Export capabilities",
  },
  {
    id: "7",
    title: "Collaboration Tools",
    publishDate: "2024-02-15",
    summary:
      "Added new collaboration features enabling team members to work together more effectively.",
    content:
      "## Team Features\n\n- Shared workspaces\n- Real-time editing\n- Comment threads",
  },
  {
    id: "8",
    title: "Accessibility Improvements",
    publishDate: "2024-02-10",
    summary:
      "Major accessibility updates to ensure our platform is usable by everyone.",
    content:
      "## A11y Updates\n\n- WCAG 2.1 compliance\n- Screen reader optimization\n- Keyboard navigation",
  },
  {
    id: "9",
    title: "Integration Marketplace",
    publishDate: "2024-02-05",
    summary: "Launched marketplace for third-party integrations and plugins.",
    content:
      "## Marketplace Features\n\n- Plugin directory\n- Developer tools\n- Integration API",
  },
  {
    id: "10",
    title: "Search Enhancement",
    publishDate: "2024-01-30",
    summary:
      "Improved search functionality with advanced filters and better results ranking.",
    content:
      "## Search Updates\n\n- Advanced filters\n- Fuzzy search\n- Search analytics",
  },
  {
    id: "11",
    title: "Performance Monitoring",
    publishDate: "2024-01-25",
    summary:
      "Introduced new tools for monitoring and optimizing application performance.",
    content:
      "## Monitoring Features\n\n- Real-time metrics\n- Error tracking\n- Performance alerts",
  },
  {
    id: "12",
    title: "User Onboarding",
    publishDate: "2024-01-20",
    summary:
      "Streamlined user onboarding process with interactive tutorials and guides.",
    content:
      "## Onboarding Updates\n\n- Interactive tutorials\n- Progress tracking\n- Customizable flows",
  },
];

interface ChangelogPreviewProps {
  isMobile?: boolean;
  repo: {
    themeHeaderBg: string;
    croppedLogoFilepath: string | null;
    themeHeading: string;
    themeDescription: string;
    themeLinkText: string;
    themeLinkPath: string;
  };
}

export default function ChangelogPreview({
  isMobile,
  repo,
}: ChangelogPreviewProps) {
  return (
    <div className="bg-background flex flex-col gap-10">
      <ChangelogHeader
        logoPath={repo.croppedLogoFilepath || ""}
        logoAlt={`${repo.themeHeading} logo`}
        title={repo.themeHeading}
        description={repo.themeDescription}
        path={repo.themeLinkPath}
        linkText={repo.themeLinkText}
        headerBg={repo.themeHeaderBg}
        isMobile={isMobile}
      />

      <div className="mx-auto w-full max-w-4xl px-4">
        <Changes logs={DUMMY_LOGS} isMobile={isMobile} />
      </div>
    </div>
  );
}
