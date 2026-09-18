import { Component, useEffect, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { HomePage } from "@/features/home/HomePage";
import { LandingPage } from "@/features/landing/LandingPage";
import { DeckPage } from "@/features/deck/DeckPage";
import { PlayPage } from "@/features/play/PlayPage";
import { PrintPage } from "@/features/print/PrintPage";
import { SetsPage } from "@/features/sets/SetsPage";
import { TemplateEditor } from "@/features/template/TemplateEditor";
import { PieceSpecLibrary } from "@/features/template/PieceSpecLibrary";
import { MediaPage } from "@/features/media/MediaPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { VarsPage } from "@/features/vars/VarsPage";
import { MarketPage } from "@/features/market/MarketPage";
import { WorkspaceLayout } from "@/features/workspace/WorkspaceLayout";
import { BoxPage } from "@/features/box/BoxPage";
import { BoardPage } from "@/features/board/BoardPage";
import { ManualPage } from "@/features/manual/ManualPage";
import { ShotPage } from "@/features/shot/ShotPage";
import { StudioPage } from "@/features/studio/StudioPage";
import { useAppStore } from "@/store/appStore";
import { bootLocale, useT } from "@/store/localeStore";
import { applyTheme, useThemeStore } from "@/store/themeStore";
import { versionStamp } from "@/lib/appVersion";

class ErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };
  static getDerivedStateFromError(err: Error) {
    return { message: err.message || String(err) };
  }
  render() {
    if (this.state.message) {
      return (
        <div className="boot-splash">
          <p>页面出错：{this.state.message}</p>
          <p className="muted">局域网请继续用 http:// 打开。Chrome 显示「不安全」是正常的，不是证书问题。</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const { ready, boot, current } = useAppStore();
  const theme = useThemeStore((s) => s.theme);
  const t = useT();

  useEffect(() => {
    bootLocale();
    void boot();
    const timer = window.setTimeout(() => {
      if (!useAppStore.getState().ready) {
        useAppStore.setState({ ready: true });
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [boot]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (!ready) {
    return (
      <div className="boot-splash">
        <div className="boot-mark" />
        <p className="muted">{t("boot.loading")}</p>
        <p className="muted">{versionStamp()}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes current={!!current} />
      </HashRouter>
    </ErrorBoundary>
  );
}

function HashFix() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const path = location.pathname.replace(/prject/gi, "project");
    if (path !== location.pathname) {
      navigate(path + location.search, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);
  return null;
}

function AppRoutes({ current }: { current: boolean }) {
  const location = useLocation();
  const scene = location.pathname.startsWith("/project") ? "/project" : location.pathname.split("?")[0];
  return (
    <div key={scene} className="route-scene">
      <HashFix />
      <Routes location={location}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<HomePage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="/market" element={<MarketPage />} />
        <Route
          path="/project"
          element={current ? <WorkspaceLayout /> : <Navigate to="/app" replace />}
        >
          <Route index element={<Navigate to="template" replace />} />
          <Route path="specs" element={<PieceSpecLibrary />} />
          <Route path="template" element={<TemplateEditor />} />
          <Route path="sets" element={<SetsPage />} />
          <Route path="deck" element={<DeckPage />} />
          <Route path="play" element={<Navigate to="/play" replace />} />
          <Route path="vars" element={<VarsPage />} />
          <Route path="media" element={<MediaPage />} />
          <Route path="stage" element={<PlayPage setupMode />} />
          <Route path="print" element={<PrintPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="box" element={<BoxPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="shot" element={<ShotPage />} />
          <Route path="studio" element={<StudioPage />} />
          <Route path="manual" element={<ManualPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
