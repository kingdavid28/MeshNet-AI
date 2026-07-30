"""
topology_viz.py
────────────────────────────────────────────────────────────────────────────
Topology visualization component for MeshNet-AI Kivy application.

This module provides network topology visualization using Kivy canvas,
displaying mesh nodes and their connections in a visual graph format.
"""

from kivy.uix.widget import Widget
from kivy.graphics import Color, Ellipse, Line, Rectangle
from kivy.properties import NumericProperty, ListProperty
from kivy.vector import Vector
from kivy.clock import Clock
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import math


@dataclass
class VisualNode:
    """Visual representation of a mesh node."""
    id: str
    label: str
    x: float
    y: float
    radius: float
    color: Tuple[float, float, float, float]
    battery: int
    signal: int
    role: str


@dataclass
class VisualEdge:
    """Visual representation of a connection between nodes."""
    from_node: str
    to_node: str
    color: Tuple[float, float, float, float]
    width: float
    protocol: str


class TopologyWidget(Widget):
    """
    Kivy widget for visualizing mesh network topology.
    
    Displays nodes as circles with labels and connections as lines.
    Supports automatic layout, zooming, and panning.
    """
    
    node_radius = NumericProperty(20)
    node_colors = ListProperty([
        (0.2, 0.6, 0.8, 1),   # Blue - peer
        (0.8, 0.4, 0.2, 1),   # Orange - relay
        (0.2, 0.8, 0.4, 1),   # Green - gateway
        (0.8, 0.2, 0.4, 1),   # Red - emergency
    ])
    edge_color = (0.5, 0.5, 0.5, 0.5)
    background_color = (0.95, 0.95, 0.97, 1)
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.nodes: Dict[str, VisualNode] = {}
        self.edges: List[VisualEdge] = []
        self._scale = 1.0
        self._offset_x = 0
        self._offset_y = 0
        self._selected_node: Optional[str] = None
        
        # Draw background
        with self.canvas.before:
            Color(*self.background_color)
            self.bg_rect = Rectangle(pos=self.pos, size=self.size)
        
        # Bind to size changes
        self.bind(size=self._update_background)
        self.bind(pos=self._update_background)
    
    def _update_background(self, instance, value):
        """Update background rectangle when widget size/position changes."""
        self.bg_rect.pos = self.pos
        self.bg_rect.size = self.size
    
    def update_topology(self, nodes_data: List[Dict], edges_data: Optional[List[Dict]] = None):
        """
        Update the topology visualization with new data.
        
        Args:
            nodes_data: List of node dictionaries from backend
            edges_data: Optional list of edge dictionaries
        """
        from routing import parse_backend_nodes
        
        # Parse nodes
        parsed_nodes = parse_backend_nodes(nodes_data)
        
        # Clear existing visualization
        self.canvas.clear()
        with self.canvas.before:
            Color(*self.background_color)
            self.bg_rect = Rectangle(pos=self.pos, size=self.size)
        
        # Calculate node positions (force-directed layout)
        self._calculate_layout(parsed_nodes)
        
        # Create visual nodes
        self.nodes.clear()
        for node in parsed_nodes:
            color = self._get_node_color(node.role)
            visual_node = VisualNode(
                id=node.id,
                label=node.label,
                x=0,  # Will be set by layout
                y=0,
                radius=self.node_radius,
                color=color,
                battery=node.battery,
                signal=node.signal,
                role=node.role
            )
            self.nodes[node.id] = visual_node
        
        # Create visual edges
        self.edges.clear()
        if edges_data:
            for edge in edges_data:
                self.edges.append(VisualEdge(
                    from_node=edge.get('from', ''),
                    to_node=edge.get('to', ''),
                    color=self._get_edge_color(edge.get('protocol', 'wifi')),
                    width=2,
                    protocol=edge.get('protocol', 'wifi')
                ))
        
        # Draw everything
        self._draw_topology()
    
    def _calculate_layout(self, nodes: List):
        """
        Calculate node positions using force-directed layout algorithm.
        
        Args:
            nodes: List of parsed MeshNode objects
        """
        if not nodes:
            return
        
        center_x = self.width / 2
        center_y = self.height / 2
        radius = min(self.width, self.height) / 3
        
        # Simple circular layout for now
        num_nodes = len(nodes)
        for i, node in enumerate(nodes):
            angle = (2 * math.pi * i) / num_nodes
            x = center_x + radius * math.cos(angle)
            y = center_y + radius * math.sin(angle)
            
            if node.id in self.nodes:
                self.nodes[node.id].x = x
                self.nodes[node.id].y = y
    
    def _draw_topology(self):
        """Draw the topology visualization on the canvas."""
        # Draw edges first (behind nodes)
        for edge in self.edges:
            if edge.from_node in self.nodes and edge.to_node in self.nodes:
                from_node = self.nodes[edge.from_node]
                to_node = self.nodes[edge.to_node]
                
                with self.canvas:
                    Color(*edge.color)
                    Line(
                        points=[from_node.x, from_node.y, to_node.x, to_node.y],
                        width=edge.width
                    )
        
        # Draw nodes
        for node in self.nodes.values():
            self._draw_node(node)
    
    def _draw_node(self, node: VisualNode):
        """
        Draw a single node on the canvas.
        
        Args:
            node: VisualNode to draw
        """
        with self.canvas:
            # Node circle
            Color(*node.color)
            Ellipse(
                pos=(node.x - node.radius, node.y - node.radius),
                size=(node.radius * 2, node.radius * 2)
            )
            
            # Battery indicator (inner circle)
            battery_color = self._get_battery_color(node.battery)
            Color(*battery_color)
            battery_radius = node.radius * 0.3
            Ellipse(
                pos=(node.x - battery_radius, node.y - battery_radius),
                size=(battery_radius * 2, battery_radius * 2)
            )
            
            # Selection highlight
            if self._selected_node == node.id:
                Color(1, 1, 0, 0.5)  # Yellow highlight
                Ellipse(
                    pos=(node.x - node.radius - 5, node.y - node.radius - 5),
                    size=((node.radius + 5) * 2, (node.radius + 5) * 2)
                )
    
    def _get_node_color(self, role: str) -> Tuple[float, float, float, float]:
        """
        Get color for node based on role.
        
        Args:
            role: Node role (peer, relay, gateway, etc.)
            
        Returns:
            RGBA color tuple
        """
        role_colors = {
            'peer': self.node_colors[0],
            'relay': self.node_colors[1],
            'gateway': self.node_colors[2],
            'emergency': self.node_colors[3]
        }
        return role_colors.get(role.lower(), self.node_colors[0])
    
    def _get_edge_color(self, protocol: str) -> Tuple[float, float, float, float]:
        """
        Get color for edge based on protocol.
        
        Args:
            protocol: Connection protocol (wifi, bluetooth, etc.)
            
        Returns:
            RGBA color tuple
        """
        if protocol == 'bluetooth':
            return (0.2, 0.4, 0.8, 0.7)  # Blue for Bluetooth
        elif protocol == 'wifi':
            return (0.8, 0.6, 0.2, 0.7)  # Orange for WiFi
        return self.edge_color
    
    def _get_battery_color(self, battery: int) -> Tuple[float, float, float, float]:
        """
        Get color for battery indicator.
        
        Args:
            battery: Battery percentage (0-100)
            
        Returns:
            RGBA color tuple
        """
        if battery > 50:
            return (0.2, 0.8, 0.4, 1)  # Green
        elif battery > 20:
            return (0.8, 0.6, 0.2, 1)  # Orange
        else:
            return (0.8, 0.2, 0.4, 1)  # Red
    
    def on_touch_down(self, touch):
        """
        Handle touch events for node selection.
        
        Args:
            touch: Kivy touch event
        """
        if not self.collide_point(*touch.pos):
            return False
        
        # Check if touch is on a node
        for node_id, node in self.nodes.items():
            distance = Vector(touch.x, touch.y).distance(Vector(node.x, node.y))
            if distance <= node.radius:
                self._selected_node = node_id
                self._draw_topology()
                return True
        
        # Deselect if touch is not on a node
        if self._selected_node:
            self._selected_node = None
            self._draw_topology()
            return True
        
        return False
    
    def get_selected_node(self) -> Optional[VisualNode]:
        """
        Get the currently selected node.
        
        Returns:
            VisualNode if selected, None otherwise
        """
        if self._selected_node and self._selected_node in self.nodes:
            return self.nodes[self._selected_node]
        return None
    
    def clear(self):
        """Clear the topology visualization."""
        self.nodes.clear()
        self.edges.clear()
        self.canvas.clear()
        with self.canvas.before:
            Color(*self.background_color)
            self.bg_rect = Rectangle(pos=self.pos, size=self.size)
