import sqlite3
import os

db_path = r"c:\Users\reycel\Downloads\Mobile App UI Design\database\meshnet.db"
print(f"DB path: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Check nodes table schema
cursor.execute("PRAGMA table_info(nodes);")
nodes_schema = cursor.fetchall()
print(f"nodes table schema: {nodes_schema}")

# Check mesh_nodes table schema  
cursor.execute("PRAGMA table_info(mesh_nodes);")
mesh_nodes_schema = cursor.fetchall()
print(f"mesh_nodes table schema: {mesh_nodes_schema}")

# Check both table counts
cursor.execute("SELECT COUNT(*) FROM nodes;")
nodes_count = cursor.fetchone()[0]
print(f"nodes count: {nodes_count}")

cursor.execute("SELECT COUNT(*) FROM mesh_nodes;")
mesh_nodes_count = cursor.fetchone()[0]
print(f"mesh_nodes count: {mesh_nodes_count}")

conn.close()
