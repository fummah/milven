import React, { useEffect, useState } from 'react';
import { Layout, Menu, Avatar, Typography } from 'antd';
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
  ProfileOutlined
} from '@ant-design/icons';
import { Link, Outlet, useLocation } from 'react-router-dom';

const { Sider, Content } = Layout;

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
  { key: 'dashboard', icon: badge(<DashboardOutlined />, '#102540', '#e6f4ff'), label: <Link to="/admin">Dashboard</Link> },
  {
    key: 'users',
    icon: badge(<UserOutlined />, '#13c2c2', '#e6fffb'),
    label: 'Users',
    children: [
      { key: 'users-list', icon: badge(<TeamOutlined />, '#13c2c2', '#e6fffb'), label: <Link to="/admin/users">Users</Link> },
      { key: 'students', icon: badge(<TeamOutlined />, '#13c2c2', '#e6fffb'), label: <Link to="/admin/students">Students</Link> },
      { key: 'roles', icon: badge(<SolutionOutlined />, '#52c41a', '#f6ffed'), label: <Link to="/admin/roles">Roles</Link> }
    ]
  },
  {
    key: 'courses',
    icon: badge(<BookOutlined />, '#722ed1', '#f9f0ff'),
    label: 'Courses',
    children: [
      { key: 'courses-list', icon: badge(<BookOutlined />, '#722ed1', '#f9f0ff'), label: <Link to="/admin/courses">Courses</Link> },
      { key: 'topics', icon: badge(<FileTextOutlined />, '#722ed1', '#f9f0ff'), label: <Link to="/admin/topics">Modules & Topics</Link> },
      { key: 'materials', icon: badge(<FileTextOutlined />, '#13c2c2', '#e6fffb'), label: <Link to="/admin/materials">Learning Materials</Link> },
      { key: 'levels', icon: badge(<ProfileOutlined />, '#2f54eb', '#f0f5ff'), label: <Link to="/admin/levels">Levels</Link> }
    ]
  },
  {
    key: 'exams',
    icon: badge(<ScheduleOutlined />, '#fa8c16', '#fff7e6'),
    label: 'Exams',
    children: [
      { key: 'exams-list', icon: badge(<FileTextOutlined />, '#eb2f96', '#fff0f6'), label: <Link to="/admin/exams">Exams</Link> },
      { key: 'exam-builder', icon: badge(<ScheduleOutlined />, '#fa8c16', '#fff7e6'), label: <Link to="/admin/exams/builder">Exam Builder</Link> }
    ]
  },
  {
    key: 'reports',
    icon: badge(<BarChartOutlined />, '#faad14', '#fffbe6'),
    label: 'Reports',
    children: [
      { key: 'reports-overview', icon: badge(<PieChartOutlined />, '#1890ff', '#e6f7ff'), label: <Link to="/admin/reports">Overview</Link> }
    ]
  },
  {
    key: 'billing',
    icon: badge(<DollarOutlined />, '#52c41a', '#f6ffed'),
    label: 'Billing',
    children: [
      { key: 'products', icon: badge(<DollarOutlined />, '#52c41a', '#f6ffed'), label: <Link to="/admin/products">Products</Link> },
      { key: 'purchases', icon: badge(<DollarOutlined />, '#2f54eb', '#f0f5ff'), label: <Link to="/admin/purchases">Purchases</Link> },
      { key: 'invoices', icon: badge(<FileTextOutlined />, '#722ed1', '#f9f0ff'), label: <Link to="/admin/invoices">Invoices</Link> },
      { key: 'subscriptions', icon: badge(<DollarOutlined />, '#52c41a', '#f6ffed'), label: <Link to="/admin/subscriptions">Subscriptions</Link> },
      { key: 'taxes', icon: badge(<FileTextOutlined />, '#fa541c', '#fff2e8'), label: <Link to="/admin/taxes">Taxes</Link> }
    ]
  },
  { key: 'settings', icon: badge(<SettingOutlined />, '#595959', '#fafafa'), label: <Link to="/admin/settings">Settings</Link> }
];

// Parent key for each submenu item so we keep the parent open when a child is selected
const childToParentKey = {
  'users-list': 'users', students: 'users', roles: 'users',
  'courses-list': 'courses', topics: 'courses', materials: 'courses', levels: 'courses',
  'exams-list': 'exams', 'exam-builder': 'exams',
  'reports-overview': 'reports',
  products: 'billing', purchases: 'billing', invoices: 'billing', subscriptions: 'billing', taxes: 'billing'
};

export default function AdminLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [openKeys, setOpenKeys] = useState([]);
  const location = useLocation();
  // Auto-collapse for immersive preview pages
  useEffect(() => {
    const p = location.pathname;
    if (/^\/admin\/courses\/[^/]+\/preview$/.test(p)) {
      setCollapsed(true);
    }
  }, [location.pathname]);

  // derive selected keys from path
  const selected = (() => {
    const path = location.pathname.replace(/^\/admin\/?/, '');
    if (!path) return ['dashboard'];
    const parts = path.split('/');
    const key = ['admin', ...parts].join('-').replace(/^admin-/, '');
    const flatKeys = [
      'dashboard',
      'users-list',
      'roles',
      'levels',
      'courses-list',
      'topics',
      'materials',
      'exams',
      'exams-list',
      'exam-builder',
      'reports',
      'reports-overview',
      'invoices',
      'subscriptions',
      'settings'
    ];
    const match = flatKeys.find(k => key.includes(k.split('-')[0])) ?? 'dashboard';
    return [match];
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

  const siderWidth = collapsed ? 80 : 260;
  const HEADER_OFFSET = 64;
  const SIDER_TOP_GAP = 12; // extra space below header
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(v) => {
          setCollapsed(v);
          if (v) setOpenKeys([]);
        }}
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
          borderRight: '1px solid #eef2f7',
          paddingLeft: 12
        }}
        className="admin-sider"
      >
        <div className="flex items-center gap-2 px-2 py-4 border-b border-gray-100">
          <Avatar style={{ background: '#102540' }} icon={<UserOutlined />} />
          {!collapsed && (
            <div className="leading-tight">
              <Typography.Text strong>MILVEN Admin</Typography.Text>
              <div className="text-xs text-gray-500">Control Panel</div>
            </div>
          )}
        </div>
        <Menu
          mode="inline"
          items={menuItems}
          selectedKeys={selected}
          openKeys={collapsed ? [] : openKeys}
          onOpenChange={(keys) => {
            if (!collapsed) setOpenKeys(keys);
          }}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout style={{ marginLeft: siderWidth, minHeight: '100vh' }}>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}

