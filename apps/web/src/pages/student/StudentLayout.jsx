import React, { useEffect, useRef, useState } from 'react';
import { Layout, Menu, Typography, Avatar, Grid, Drawer, Button } from 'antd';
import { HomeOutlined, BookOutlined, ReadOutlined, DollarOutlined, FileTextOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined, ExclamationCircleOutlined, StarOutlined, TeamOutlined, ExperimentOutlined, FunctionOutlined, SolutionOutlined, SnippetsOutlined, BarChartOutlined, FilePptOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

const isLearningPreviewPath = (pathname) => pathname.startsWith('/student/learn/') || pathname === '/student/learning';
const isResourceExplorerPath = (pathname) => /^\/student\/(slides|module-notes|formula-book|summary-sheets)(\/|$)/.test(pathname);
const isCompactLearningPath = (pathname) => isLearningPreviewPath(pathname) || isResourceExplorerPath(pathname);

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
  'student-learning': 'learning', 'student-module-notes': 'learning',
  'student-summary-sheets': 'learning', 'student-formula-book': 'learning', 'student-slides': 'learning',
  'student-exams': 'exams-group', 'student-mock-exams': 'exams-group', 'student-milven-mocks': 'exams-group',
  'student-mistakes': 'exams-group', 'student-revision': 'exams-group',
  'student-billing': 'account-group', 'student-invoices': 'account-group', 'student-account': 'account-group'
};

const buildMenuItems = onParentTitleClick => [
  { key: 'student-home', icon: modernBadge(<HomeOutlined />, 'linear-gradient(135deg, #3b82f6, #1d4ed8)'), label: <Link to="/student">Dashboard</Link> },
  { key: 'student-courses', icon: modernBadge(<BookOutlined />, 'linear-gradient(135deg, #0ea5e9, #0284c7)'), label: <Link to="/student/courses">My Courses</Link> },
  {
    key: 'learning',
    title: 'Learning',
    popupClassName: 'student-submenu-popup student-submenu-learning',
    popupOffset: [10, 0],
    onTitleClick: () => onParentTitleClick?.('learning'),
    icon: modernBadge(<ReadOutlined />, 'linear-gradient(135deg, #8b5cf6, #7c3aed)'),
    label: 'Learning',
    children: [
      { key: 'student-learning', icon: subMenuBadge(<ReadOutlined />, '#8b5cf6'), label: <Link to="/student/learning">Learning Center</Link> },
      { key: 'student-module-notes', icon: subMenuBadge(<SnippetsOutlined />, '#8b5cf6'), label: <Link to="/student/module-notes">Milven Module Notes</Link> },
      { key: 'student-summary-sheets', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/student/summary-sheets">Milven Summary Sheets</Link> },
      { key: 'student-formula-book', icon: subMenuBadge(<FunctionOutlined />, '#8b5cf6'), label: <Link to="/student/formula-book">Milven Formula Book</Link> },
      { key: 'student-slides', icon: subMenuBadge(<FilePptOutlined />, '#8b5cf6'), label: <Link to="/student/slides">Milven Slides</Link> }
    ]
  },
  {
    key: 'exams-group',
    title: 'Exams & Practice',
    popupClassName: 'student-submenu-popup student-submenu-exams',
    popupOffset: [10, 0],
    onTitleClick: () => onParentTitleClick?.('exams-group'),
    icon: modernBadge(<ReadOutlined />, 'linear-gradient(135deg, #f97316, #ea580c)'),
    label: 'Exams & Practice',
    children: [
      { key: 'student-exams', icon: subMenuBadge(<ReadOutlined />, '#f97316'), label: <Link to="/student/exams">Practice Questions</Link> },
      { key: 'student-mock-exams', icon: subMenuBadge(<ExperimentOutlined />, '#6366f1'), label: <Link to="/student/mock-exams">Mock Exam</Link> },
      { key: 'student-milven-mocks', icon: subMenuBadge(<SolutionOutlined />, '#102540'), label: <Link to="/student/milven-mocks">Milven Mock Exams</Link> },
      { key: 'student-mistakes', icon: subMenuBadge(<ExclamationCircleOutlined />, '#ef4444'), label: <Link to="/student/mistakes">My Mistakes</Link> },
      { key: 'student-revision', icon: subMenuBadge(<StarOutlined />, '#eab308'), label: <Link to="/student/revision">Revision List</Link> }
    ]
  },
  { key: 'student-comparison', icon: modernBadge(<BarChartOutlined />, 'linear-gradient(135deg, #0ea5e9, #0284c7)'), label: <Link to="/student/comparison">Performance</Link> },
  {
    key: 'account-group',
    title: 'Account & Billing',
    popupClassName: 'student-submenu-popup student-submenu-account',
    popupOffset: [10, 0],
    onTitleClick: () => onParentTitleClick?.('account-group'),
    icon: modernBadge(<UserOutlined />, 'linear-gradient(135deg, #64748b, #475569)'),
    label: 'Account & Billing',
    children: [
      { key: 'student-billing', icon: subMenuBadge(<DollarOutlined />, '#22c55e'), label: <Link to="/student/billing">Billing</Link> },
      { key: 'student-invoices', icon: subMenuBadge(<FileTextOutlined />, '#6366f1'), label: <Link to="/student/invoices">Invoices</Link> },
      { key: 'student-account', icon: subMenuBadge(<UserOutlined />, '#64748b'), label: <Link to="/student/account">Account</Link> }
    ]
  }
];
export default function StudentLayout() {
  const location = useLocation();
  const isCompactLearningRoute = isCompactLearningPath(location.pathname);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const manualOverridePath = useRef(null);

  // Keep the same compact behaviour as the Learning Center on the resource explorer pages.
  const [collapsed, setCollapsed] = useState(() => isCompactLearningRoute);
  const [collapsedOpenKeys, setCollapsedOpenKeys] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuItems = buildMenuItems(key => {
    if (isMobile || !collapsed) return;
    setCollapsedOpenKeys(previous => previous.includes(key) ? [] : [key]);
  });

  const handleCollapsedMenuKeyDown = event => {
    if (isMobile || !collapsed || (event.key !== ' ' && event.key !== 'Spacebar')) return;
    const title = event.target instanceof Element ? event.target.closest('.ant-menu-submenu-title') : null;
    if (!title) return;
    const menuId = title.getAttribute('data-menu-id') || '';
    const key = ['learning', 'exams-group', 'account-group'].find(item => menuId.includes(item));
    if (!key) return;
    event.preventDefault();
    setCollapsedOpenKeys(previous => previous.includes(key) ? [] : [key]);
  };

  const handleSidebarCollapse = (nextCollapsed) => {
    setCollapsed(nextCollapsed);
    manualOverridePath.current = isCompactLearningRoute ? location.pathname : null;
  };

  // Collapse on entering a compact learning route. A manual expand on the same
  // route is respected until the student navigates to a different page.
  useEffect(() => {
    if (isMobile) {
      setCollapsed(true);
      return;
    }
    if (isCompactLearningRoute) {
      if (manualOverridePath.current !== location.pathname) setCollapsed(true);
    } else {
      manualOverridePath.current = null;
      setCollapsed(false);
    }
  }, [isCompactLearningRoute, isMobile, location.pathname]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
    if (isMobile) setMobileOpen(false);
    setCollapsedOpenKeys([]);
  }, [isMobile, location.pathname]);

  useEffect(() => {
    if (!collapsed) setCollapsedOpenKeys([]);
  }, [collapsed]);

  useEffect(() => {
    if (!collapsed || collapsedOpenKeys.length === 0) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setCollapsedOpenKeys([]);
    };
    const closeOutside = event => {
      const target = event.target;
      if (target instanceof Element && (target.closest('.student-sider') || target.closest('.student-submenu-popup'))) return;
      setCollapsedOpenKeys([]);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.addEventListener('pointerdown', closeOutside, true);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.removeEventListener('pointerdown', closeOutside, true);
    };
  }, [collapsed, collapsedOpenKeys.length]);

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
  
  const siderWidth = (isMobile ? 0 : (collapsed ? 80 : 290));
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12;
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={handleSidebarCollapse}
          trigger={null}
          theme="light"
          width={290}
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
            openKeys={collapsed ? collapsedOpenKeys : openKeys}
            onOpenChange={keys => {
              if (collapsed) setCollapsedOpenKeys(keys);
              else setOpenKeys(keys);
            }}
            onKeyDown={handleCollapsedMenuKeyDown}
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

