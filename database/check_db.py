import sqlite3
import os

db_path = r"c:\Users\reycel\Downloads\Mobile App UI Design\database\meshnet.db"
print(f"DB path: {db_path}")
print(f"DB exists: {os.path.exists(db_path)}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
tables = cursor.fetchall()
print(f"Tables: {tables}")

cursor.execute("SELECT COUNT(*) FROM nodes;")
node_count = cursor.fetchone()[0]
print(f"Node count: {node_count}")

cursor.execute("SELECT * FROM nodes LIMIT 5;")
nodes = cursor.fetchall()
print(f"Sample nodes: {nodes}")

cursor.execute("SELECT COUNT(*) FROM edges;")
edge_count = cursor.fetchone()[0]
print(f"Edge count: {edge_count}")

conn.close()
