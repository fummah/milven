import React, { useEffect, useState } from 'react';
import { Layout, Menu, Avatar, Typography, Grid, Drawer, Button } from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  TeamOutlined,
  BookOutlined,
  DollarOutlined,
  FileTextOutlined,
  BarChartOutlined,
  PieChartOutlined,
  SettingOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  ProfileOutlined,
  FolderOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FunctionOutlined
} from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

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
    {React.isValidElement(iconNode) ? React.cloneElement(iconNode, { style: { ...iconNode.props?.style, color } }) : iconNode}
  </span>
);

const menuItems = [
  { key: 'dashboard', icon: modernBadge(<DashboardOutlined />, 'linear-gradient(135deg, #3b82f6, #1d4ed8)'), label: <Link to="/admin">Dashboard</Link> },
  {
    key: 'users',
    icon: modernBadge(<UserOutlined />, 'linear-gradient(135deg, #06b6d4, #0891b2)'),
    label: 'Users',
    children: [
      { key: 'users-list', icon: subMenuBadge(<TeamOutlined />, '#06b6d4'), label: <Link to="/admin/users">Users</Link> },
      { key: 'students', icon: subMenuBadge(<TeamOutlined />, '#06b6d4'), label: <Link to="/admin/students">Candidates</Link> },
      { key: 'roles', icon: subMenuBadge(<SolutionOutlined />, '#06b6d4'), label: <Link to="/admin/roles">Roles</Link> }
    ]
  },
  {
    key: 'courses',
    icon: modernBadge(<BookOutlined />, 'linear-gradient(135deg, #8b5cf6, #7c3aed)'),
    label: 'Courses',
    children: [
      { key: 'courses-list', icon: subMenuBadge(<BookOutlined />, '#8b5cf6'), label: <Link to="/admin/courses">Courses</Link> },
      { key: 'volumes', icon: subMenuBadge(<FolderOutlined />, '#8b5cf6'), label: <Link to="/admin/volumes">Volumes</Link> },
      { key: 'topics', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/admin/topics">Learning Modules</Link> },
      { key: 'questions', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/admin/questions">Questions</Link> },
      { key: 'materials', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/admin/materials">Learning Materials</Link> },
      { key: 'documents', icon: subMenuBadge(<FolderOutlined />, '#8b5cf6'), label: <Link to="/admin/documents">Curriculum Docs</Link> },
      { key: 'pdf-mapping', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/admin/pdf-mapping">PDF Mapping</Link> },
      { key: 'formulas', icon: subMenuBadge(<FunctionOutlined />, '#8b5cf6'), label: <Link to="/admin/formulas">Formula Book</Link> },
      { key: 'summary-sheets', icon: subMenuBadge(<FileTextOutlined />, '#8b5cf6'), label: <Link to="/admin/summary-sheets">Summary Sheets</Link> },
      { key: 'module-notes', icon: subMenuBadge(<BookOutlined />, '#8b5cf6'), label: <Link to="/admin/module-notes">Module Notes</Link> },
      { key: 'levels', icon: subMenuBadge(<ProfileOutlined />, '#8b5cf6'), label: <Link to="/admin/levels">Levels</Link> }
    ]
  },
  {
    key: 'exams',
    icon: modernBadge(<ScheduleOutlined />, 'linear-gradient(135deg, #f97316, #ea580c)'),
    label: 'Exams',
    children: [
      { key: 'exams-list', icon: subMenuBadge(<FileTextOutlined />, '#f97316'), label: <Link to="/admin/exams">Exams</Link> },
      { key: 'exam-builder', icon: subMenuBadge(<ScheduleOutlined />, '#f97316'), label: <Link to="/admin/exams/builder">Exam Builder</Link> },
      { key: 'mock-exams', icon: subMenuBadge(<SolutionOutlined />, '#f97316'), label: <Link to="/admin/mock-exams">Mock Exams</Link> }
    ]
  },
  {
    key: 'reports',
    icon: modernBadge(<BarChartOutlined />, 'linear-gradient(135deg, #eab308, #ca8a04)'),
    label: 'Reports',
    children: [
      { key: 'reports-overview', icon: subMenuBadge(<PieChartOutlined />, '#eab308'), label: <Link to="/admin/reports">Overview</Link> }
    ]
  },
  {
    key: 'billing',
    icon: modernBadge(<DollarOutlined />, 'linear-gradient(135deg, #22c55e, #16a34a)'),
    label: 'Billing',
    children: [
      { key: 'products', icon: subMenuBadge(<DollarOutlined />, '#22c55e'), label: <Link to="/admin/products">Products</Link> },
      { key: 'purchases', icon: subMenuBadge(<DollarOutlined />, '#22c55e'), label: <Link to="/admin/purchases">Purchases</Link> },
      { key: 'invoices', icon: subMenuBadge(<FileTextOutlined />, '#22c55e'), label: <Link to="/admin/invoices">Invoices</Link> },
      { key: 'subscriptions', icon: subMenuBadge(<DollarOutlined />, '#22c55e'), label: <Link to="/admin/subscriptions">Subscriptions</Link> },
      { key: 'taxes', icon: subMenuBadge(<FileTextOutlined />, '#22c55e'), label: <Link to="/admin/taxes">Taxes</Link> }
    ]
  },
  { key: 'settings', icon: modernBadge(<SettingOutlined />, 'linear-gradient(135deg, #64748b, #475569)'), label: <Link to="/admin/settings">Settings</Link> }
];

const isPreviewPath = (pathname) => /^\/admin\/courses\/[^/]+\/preview$/.test(pathname);

// Parent key for each submenu item so we keep the parent open when a child is selected
const childToParentKey = {
  'users-list': 'users', students: 'users', roles: 'users',
  'courses-list': 'courses', volumes: 'courses', topics: 'courses', questions: 'courses', materials: 'courses', documents: 'courses', formulas: 'courses', 'summary-sheets': 'courses', 'module-notes': 'courses', levels: 'courses',
  'exams-list': 'exams', 'exam-builder': 'exams', 'mock-exams': 'exams',
  'reports-overview': 'reports',
  products: 'billing', purchases: 'billing', invoices: 'billing', subscriptions: 'billing', taxes: 'billing'
};

export default function AdminLayout() {
  const location = useLocation();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const isPreview = isPreviewPath(location.pathname);
  
  // Only collapse by default on preview pages
  const [collapsed, setCollapsed] = useState(isPreview);
  const [openKeys, setOpenKeys] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse/expand based on preview page
  useEffect(() => {
    if (isPreview) {
      setCollapsed(true);
    } else if (!isMobile) {
      setCollapsed(false);
    }
  }, [isPreview, isMobile]);

  // derive selected keys from path
  const selected = (() => {
    const path = location.pathname.replace(/^\/admin\/?/, '');
    if (!path) return ['dashboard'];

    // Map URL path segments to menu item keys
    const pathToKey = {
      'users': 'users-list',
      'students': 'students',
      'roles': 'roles',
      'courses': 'courses-list',
      'volumes': 'volumes',
      'topics': 'topics',
      'questions': 'questions',
      'materials': 'materials',
      'documents': 'documents',
      'formulas': 'formulas',
      'summary-sheets': 'summary-sheets',
      'module-notes': 'module-notes',
      'levels': 'levels',
      'exams': 'exams-list',
      'exams/builder': 'exam-builder',
      'mock-exams': 'mock-exams',
      'reports': 'reports-overview',
      'products': 'products',
      'purchases': 'purchases',
      'invoices': 'invoices',
      'subscriptions': 'subscriptions',
      'taxes': 'taxes',
      'settings': 'settings',
    };

    // Try longest match first (e.g. 'exams/builder' before 'exams')
    const sortedPaths = Object.keys(pathToKey).sort((a, b) => b.length - a.length);
    for (const p of sortedPaths) {
      if (path === p || path.startsWith(p + '/')) {
        return [pathToKey[p]];
      }
    }
    return ['dashboard'];
  })();

  // Keep parent submenu open when navigating to a child (e.g. Users stays open when clicking Roles)
  useEffect(() => {
    const parentKey = selected[0] && childToParentKey[selected[0]];
    if (!collapsed && parentKey) {
      setOpenKeys(prev => (prev.includes(parentKey) ? prev : [...prev, parentKey]));
    }
  }, [selected, collapsed]);

  useEffect(() => {
    if (collapsed) setOpenKeys([]);
  }, [collapsed]);

  useEffect(() => {
    if (isMobile) setCollapsed(true);
    if (isMobile) setMobileOpen(false);
  }, [isMobile, location.pathname]);

  const siderWidth = (isMobile ? 0 : (collapsed ? 80 : 280));
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12;
  
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <style>{`
        .sub-menu-icon-badge .anticon,
        .sub-menu-icon-badge svg {
          color: inherit !important;
          fill: currentColor !important;
        }
      `}</style>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={(v) => {
            setCollapsed(v);
            if (v) setOpenKeys([]);
          }}
          trigger={null}
          theme="light"
          width={280}
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
          className="admin-sider modern-sider"
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
                    MILVEN Admin
                  </Typography.Text>
                  <Typography.Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    Control Panel
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
            inlineCollapsed={collapsed}
            triggerSubMenuAction="hover"
            items={menuItems}
            selectedKeys={selected}
            openKeys={collapsed ? undefined : openKeys}
            onOpenChange={(keys) => {
              if (!collapsed) setOpenKeys(keys);
            }}
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
                    <span>Admin Menu</span>
                  </div>
                }
                placement="left"
                open={mobileOpen}
                onClose={() => setMobileOpen(false)}
                width={Math.min(320, typeof window !== 'undefined' ? window.innerWidth * 0.86 : 320)}
                className="modern-drawer"
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

