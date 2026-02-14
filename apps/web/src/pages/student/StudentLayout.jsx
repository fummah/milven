import React, { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Avatar, Grid, Drawer, Button } from 'antd';
import { HomeOutlined, BookOutlined, ReadOutlined, DollarOutlined, FileTextOutlined, UserOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

const isLearningPreviewPath = (pathname) => pathname.startsWith('/student/learn/');

const badge = (iconNode, fg, bg) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 26,
      height: 26,
      borderRadius: '50%',
      background: bg,
      color: fg,
      border: '1px solid rgba(0,0,0,0.06)',
      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6)'
    }}
  >
    {iconNode}
  </span>
);

const menuItems = [
  { key: 'student-home', icon: badge(<HomeOutlined />, '#102540', '#e6f4ff'), label: <Link to="/student">Dashboard</Link> },
  { key: 'student-courses', icon: badge(<BookOutlined />, '#722ed1', '#f9f0ff'), label: <Link to="/student/courses">My Courses</Link> },
  { key: 'student-exams', icon: badge(<ReadOutlined />, '#fa8c16', '#fff7e6'), label: <Link to="/student/exams">Exams</Link> },
  { key: 'student-billing', icon: badge(<DollarOutlined />, '#52c41a', '#f6ffed'), label: <Link to="/student/billing">Billing</Link> },
  { key: 'student-invoices', icon: badge(<FileTextOutlined />, '#2f54eb', '#f0f5ff'), label: <Link to="/student/invoices">Invoices</Link> },
  { key: 'student-account', icon: badge(<UserOutlined />, '#595959', '#fafafa'), label: <Link to="/student/account">Account</Link> }
];

export default function StudentLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const isLearningPreview = isLearningPreviewPath(location.pathname);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  useEffect(() => {
    if (isLearningPreview) setCollapsed(true);
    else setCollapsed(false);
  }, [isLearningPreview]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
    if (isMobile) setMobileOpen(false);
  }, [isMobile, location.pathname]);

  const selected = (() => {
    const path = location.pathname.replace(/^\/student\/?/, '') || 'home';
    return [`student-${path.split('/')[0]}`];
  })();
  const siderWidth = (isMobile ? 0 : (collapsed ? 80 : 240));
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12; // extra space below header
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="light"
          width={240}
          collapsedWidth={80}
          style={{
            position: 'fixed',
            left: 0,
            top: HEADER_OFFSET + SIDER_TOP_GAP,
            bottom: 0,
            height: `calc(100vh - ${HEADER_OFFSET + SIDER_TOP_GAP}px)`,
            overflow: 'auto',
            zIndex: 999,
            borderRight: '1px solid #eef2f7',
            paddingLeft: 12
          }}
          className="student-sider"
        >
          <div className="flex items-center gap-2 px-2 py-4 border-b border-gray-100">
            <Avatar style={{ background: '#102540' }} icon={<UserOutlined />} />
            {!collapsed && (
              <div className="leading-tight">
                <Typography.Text strong>Student</Typography.Text>
                <div className="text-xs text-gray-500">Learning Portal</div>
              </div>
            )}
          </div>
          <Menu mode="inline" items={menuItems} selectedKeys={selected} style={{ borderRight: 0 }} />
        </Sider>
      )}
      <Layout style={{ marginLeft: siderWidth, minHeight: '100vh' }}>
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <Button onClick={() => setMobileOpen(true)}>Menu</Button>
              <Drawer
                title="Student"
                placement="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                width={Math.min(320, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)}
              >
                <Menu mode="inline" items={menuItems} selectedKeys={selected} onClick={() => setMobileOpen(false)} />
              </Drawer>
            </div>
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

