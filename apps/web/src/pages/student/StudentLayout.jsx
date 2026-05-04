import React, { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Avatar, Grid, Drawer, Button } from 'antd';
import { HomeOutlined, BookOutlined, ReadOutlined, DollarOutlined, FileTextOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ExclamationCircleOutlined, StarOutlined, TeamOutlined, ExperimentOutlined, FunctionOutlined, SolutionOutlined, SnippetsOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

const isLearningPreviewPath = (pathname) => pathname.startsWith('/student/learn/');

const modernBadge = (iconNode, gradient) => (
  <span
    className="menu-icon-badge"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 10,
      background: gradient,
      color: '#fff',
      fontSize: 15,
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}
  >
    {React.isValidElement(iconNode) ? React.cloneElement(iconNode, { style: { ...iconNode.props?.style, color: '#fff' } }) : iconNode}
  </span>
);

const subMenuBadge = (iconNode, color = '#102540') => (
  <span
    className="menu-icon-badge sub-menu-icon-badge"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 32,
      height: 32,
      borderRadius: 10,
      background: '#fff',
      border: `1.5px solid ${color}`,
      color: color,
      fontSize: 15,
      boxShadow: '0 1px 4px rgba(16,37,64,0.08)'
    }}
  >
    <span style={{ display: 'inline-flex', color, fill: color }}>
      {React.isValidElement(iconNode) ? React.cloneElement(iconNode, { style: { ...iconNode.props?.style, color, fontSize: 15 } }) : iconNode}
    </span>
  </span>
);

const childToParentKey = {
  'student-courses': 'learning', 'student-module-notes': 'learning',
  'student-formula-book': 'study-tools', 'student-summary-sheets': 'study-tools', 'student-revision': 'study-tools',
  'student-exams': 'exams-group', 'student-mock-exams': 'exams-group', 'student-milven-mocks': 'exams-group', 'student-mistakes': 'exams-group', 'student-comparison': 'exams-group',
  'student-billing': 'account-group', 'student-invoices': 'account-group', 'student-account': 'account-group'
};

const menuItems = [
  { key: 'student-home', icon: modernBadge(<HomeOutlined />, 'linear-gradient(135deg, #3b82f6, #1d4ed8)'), label: <Link to="/student">Dashboard</Link> },
  {
    key: 'learning',
    icon: modernBadge(<BookOutlined />, 'linear-gradient(135deg, #8b5cf6, #7c3aed)'),
    label: 'Learning',
    children: [
      { key: 'student-courses', icon: subMenuBadge(<BookOutlined />, '#8b5cf6'), label: <Link to="/student/courses">My Courses</Link> },
      { key: 'student-module-notes', icon: subMenuBadge(<SnippetsOutlined />, '#8b5cf6'), label: <Link to="/student/module-notes">Module Notes</Link> },
    ]
  },
  {
    key: 'study-tools',
    icon: modernBadge(<FunctionOutlined />, 'linear-gradient(135deg, #102540, #1b3a5b)'),
    label: 'Study Tools',
    children: [
      { key: 'student-formula-book', icon: subMenuBadge(<FunctionOutlined />, '#102540'), label: <Link to="/student/formula-book">Formula Book</Link> },
      { key: 'student-summary-sheets', icon: subMenuBadge(<FileTextOutlined />, '#102540'), label: <Link to="/student/summary-sheets">Summary Sheets</Link> },
      { key: 'student-revision', icon: subMenuBadge(<StarOutlined />, '#eab308'), label: <Link to="/student/revision">Revision List</Link> },
    ]
  },
  {
    key: 'exams-group',
    icon: modernBadge(<ReadOutlined />, 'linear-gradient(135deg, #f97316, #ea580c)'),
    label: 'Exams & Practice',
    children: [
      { key: 'student-exams', icon: subMenuBadge(<ReadOutlined />, '#f97316'), label: <Link to="/student/exams">Practice Questions</Link> },
      { key: 'student-mock-exams', icon: subMenuBadge(<ExperimentOutlined />, '#6366f1'), label: <Link to="/student/mock-exams">Mock Exam</Link> },
      { key: 'student-milven-mocks', icon: subMenuBadge(<SolutionOutlined />, '#102540'), label: <Link to="/student/milven-mocks">Milven Mock Exams</Link> },
      { key: 'student-mistakes', icon: subMenuBadge(<ExclamationCircleOutlined />, '#ef4444'), label: <Link to="/student/mistakes">My Mistakes</Link> },
      { key: 'student-comparison', icon: subMenuBadge(<TeamOutlined />, '#0ea5e9'), label: <Link to="/student/comparison">Compare With Peers</Link> },
    ]
  },
  {
    key: 'account-group',
    icon: modernBadge(<UserOutlined />, 'linear-gradient(135deg, #64748b, #475569)'),
    label: 'Account & Billing',
    children: [
      { key: 'student-billing', icon: subMenuBadge(<DollarOutlined />, '#22c55e'), label: <Link to="/student/billing">Billing</Link> },
      { key: 'student-invoices', icon: subMenuBadge(<FileTextOutlined />, '#6366f1'), label: <Link to="/student/invoices">Invoices</Link> },
      { key: 'student-account', icon: subMenuBadge(<UserOutlined />, '#64748b'), label: <Link to="/student/account">Account</Link> },
    ]
  }
];

export default function StudentLayout() {
  const location = useLocation();
  const isLearningPreview = isLearningPreviewPath(location.pathname);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  
  // Only collapse by default on learning preview pages
  const [collapsed, setCollapsed] = useState(isLearningPreview);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse/expand based on learning preview page
  useEffect(() => {
    if (isLearningPreview) {
      setCollapsed(true);
    } else if (!isMobile) {
      setCollapsed(false);
    }
  }, [isLearningPreview, isMobile]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
    if (isMobile) setMobileOpen(false);
  }, [isMobile, location.pathname]);

  const selected = (() => {
    const path = location.pathname.replace(/^\/student\/?/, '') || 'home';
    const segment = path.split('/')[0];
    return [`student-${segment}`];
  })();
  
  // Keep parent submenus open when a child is selected
  const [openKeys, setOpenKeys] = useState(() => {
    const sel = selected[0];
    const parent = childToParentKey[sel];
    return parent ? [parent] : [];
  });

  useEffect(() => {
    const sel = selected[0];
    const parent = childToParentKey[sel];
    if (parent && !openKeys.includes(parent)) {
      setOpenKeys(prev => [...prev, parent]);
    }
  }, [location.pathname]);
  
  const siderWidth = (isMobile ? 0 : (collapsed ? 80 : 260));
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12;
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme="light"
          width={260}
          collapsedWidth={80}
          style={{
            position: 'fixed',
            left: 0,
            top: HEADER_OFFSET + SIDER_TOP_GAP,
            bottom: 0,
            height: `calc(100vh - ${HEADER_OFFSET + SIDER_TOP_GAP}px)`,
            overflow: 'auto',
            zIndex: 999,
            background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            borderRight: '1px solid #e2e8f0',
            boxShadow: '4px 0 24px rgba(0,0,0,0.03)'
          }}
          className="student-sider modern-sider"
        >
          {/* Sidebar Header */}
          <div style={{
            padding: '20px 16px',
            borderBottom: '1px solid #f1f5f9',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
            margin: collapsed ? 8 : 12,
            borderRadius: 16,
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar 
                size={collapsed ? 40 : 44} 
                style={{ 
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  flexShrink: 0
                }} 
                icon={<UserOutlined />} 
              />
              {!collapsed && (
                <div style={{ overflow: 'hidden' }}>
                  <Typography.Text strong style={{ color: '#ffffff', fontSize: 15, display: 'block' }}>
                    Student Portal
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    Learning Dashboard
                  </Typography.Text>
                </div>
              )}
            </div>
          </div>

          {/* Collapse Toggle Button */}
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <Button 
              type="text" 
              onClick={() => setCollapsed(!collapsed)}
              style={{
                width: '100%',
                height: 40,
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                color: '#64748b',
                fontWeight: 500
              }}
            >
              {collapsed ? <MenuUnfoldOutlined /> : <><MenuFoldOutlined /> <span>Collapse Menu</span></>}
            </Button>
          </div>

          <Menu 
            mode="inline" 
            items={menuItems} 
            selectedKeys={selected}
            openKeys={collapsed ? [] : openKeys}
            onOpenChange={setOpenKeys}
            style={{ 
              borderRight: 0,
              padding: '0 8px',
              background: 'transparent'
            }} 
          />
        </Sider>
      )}
      <Layout style={{ marginLeft: siderWidth, minHeight: '100vh', transition: 'margin-left 0.2s ease' }}>
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          {isMobile && (
            <div style={{ marginBottom: 12 }}>
              <Button 
                onClick={() => setMobileOpen(true)}
                icon={<MenuUnfoldOutlined />}
                style={{ borderRadius: 10 }}
              >
                Menu
              </Button>
              <Drawer
                title={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Avatar style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }} icon={<UserOutlined />} />
                    <span>Candidate Menu</span>
                  </div>
                }
                placement="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                width={Math.min(320, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)}
                className="modern-drawer"
              >
                <Menu mode="inline" items={menuItems} selectedKeys={selected} openKeys={openKeys} onOpenChange={setOpenKeys} onClick={() => setMobileOpen(false)} />
              </Drawer>
            </div>
          )}
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

