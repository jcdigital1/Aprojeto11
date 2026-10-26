import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/AppShell";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import { ForgotPassword, ResetPassword } from "@/pages/PasswordPages";
import { ForwardRedirect, Pending, RootRedirect, Unavailable } from "@/pages/Gate";
import Dashboard from "@/pages/Dashboard";
import Generate from "@/pages/Generate";
import { BatchDetail, Batches, Exports } from "@/pages/Batches";
import QrCodes from "@/pages/QrCodes";
import Settings from "@/pages/Settings";
import { AdminBuyers, AdminHome } from "@/pages/AdminHome";
import AdminTemplates from "@/pages/AdminTemplates";
import AdminSettings from "@/pages/AdminSettings";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route path="/aguardando" element={<Pending />} />
        <Route path="/q/indisponivel" element={<Unavailable />} />
        <Route path="/r/:code" element={<ForwardRedirect />} />
        <Route path="/app" element={<AppShell area="customer" />}>
          <Route index element={<Dashboard />} />
          <Route path="gerar" element={<Generate />} />
          <Route path="lotes" element={<Batches />} />
          <Route path="lotes/:id" element={<BatchDetail />} />
          <Route path="qrcodes" element={<QrCodes />} />
          <Route path="exportacoes" element={<Exports />} />
          <Route path="configuracoes" element={<Settings />} />
        </Route>
        <Route path="/admin" element={<AppShell area="admin" />}>
          <Route index element={<AdminHome />} />
          <Route path="compradores" element={<AdminBuyers />} />
          <Route path="modelos" element={<AdminTemplates />} />
          <Route path="configuracoes" element={<AdminSettings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors theme="dark" />
    </>
  );
}
