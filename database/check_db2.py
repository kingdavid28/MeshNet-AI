import sqlite3
import os

db_path = r"c:\Users\reycel\Downloads\Mobile App UI Design\database\meshnet.db"
print(f"DB path: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM mesh_nodes;")
node_count = cursor.fetchone()[0]
print(f"mesh_nodes count: {node_count}")

cursor.execute("SELECT * FROM mesh_nodes LIMIT 5;")
nodes = cursor.fetchall()
print(f"Sample mesh_nodes: {nodes}")

conn.close()
