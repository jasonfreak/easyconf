from os.path import isfile
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from json import load, loads, dumps
from argparse import ArgumentParser
import urlparse
from sqlite3 import connect, IntegrityError
from base64 import encodestring, decodestring

class S(BaseHTTPRequestHandler):
    _tableConfig = dict()

    def _set_headers(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()

    def _setTableConfig(self, jsonString):
        for colConfig in jsonString['columns']:
            S._tableConfig[colConfig['id']] = colConfig

    def _do_Init(self, table):
        filepath =  args.rootPath + '%s.json' % table
        with open(filepath, "r") as f:
            self._setTableConfig(load(f))
            f.seek(0)
            self.wfile.write(f.read())

    def _do_Insert(self, table, data):
        db = connect(args.database)
        cs = db.cursor()
        sql1 = 'insert into {table} ('.format(table=table)
        sql2 = ' values ('
        i = 0
        for elem in data.split(','):
            (col, value) = map(lambda x:decodestring(x), elem.split(':'))
            sql1 += ('{col}' if i == 0 else ', {col}').format(col=col)
            formatValue = ('\'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
            sql2 += ('{formatValue}' if i == 0 else ', {formatValue}').format(formatValue=formatValue)
            i += 1
        sql = sql1 + ')' + sql2 + ')'
        try:
            cs.execute(sql)
        except IntegrityError, e:
            response = dict(result='01', message='NOT UNIQUE')
        else:
            response = dict(result='00', message='OK')
            db.commit()
        finally:
            db.close()
            self.wfile.write(dumps(response))

    def _do_Delete(self, table, query):
        db = connect(args.database)
        cs = db.cursor()
        sql = 'delete from {table} where 1 = 1'.format(table=table)
        if len(query) > 0:
            for elem in query.split(','):
                (col, value) = map(lambda x:decodestring(x), elem.split(':'))
                sql += ' and {col} = '.format(col=col) + ('\'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
        cs.execute(sql)
        db.commit()
        db.close()
        response = dict(result='00', message='OK')
        self.wfile.write(dumps(response))

    def _do_Update(self, table, data, query):
        db = connect(args.database)
        cs = db.cursor()
        sql = 'update {table} set'.format(table=table)
        i = 0
        for elem in data.split(','):
            (col, value) = map(lambda x:decodestring(x), elem.split(':'))
            formatValue = ('\'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
            sql += (' {col} = {formatValue}' if i == 0 else ', {col} = {formatValue}').format(col=col, formatValue=formatValue)
            i += 1
        sql += 'where 1 = 1'
        if len(query) > 0:
            for elem in query.split(','):
                (col, value) = map(lambda x:decodestring(x), elem.split(':'))
                sql += ' and {col} = '.format(col=col) + ('\'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
        cs.execute(sql)
        db.commit()
        db.close()
        response = dict(result='00', message='OK')
        self.wfile.write(dumps(response))

    def _do_Range(self, key, value, table, query):
        db = connect(args.database)
        cs = db.cursor()
        sql = 'select {key}, {value} from {table} where 1 = 1'.format(key=key, value=value, table=table)
        if len(query) > 0:
            for elem in query.split(','):
                (col, value) = map(lambda x:decodestring(x), elem.split(':'))
                sql += ' and {col} = '.format(col=col) + ('\'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
        cs.execute(sql)
        response = dict(result='00', message='OK', data=[])
        for elem in cs.fetchall():
            response['data'].append(dict(key=elem[0], value=elem[1]))
        db.close()
        self.wfile.write(dumps(response))

    def _do_List(self, table, data, begin, count, query):
        db = connect(args.database)
        cs1 = db.cursor()
        cs2 = db.cursor()
        colList = map(lambda x:decodestring(x), data.split(','))
        sql1 = 'select {data} from {table} where 1 = 1'.format(data=','.join(colList), table=table)
        if len(query) > 0:
            for elem in query.split(','):
                (col, value) = map(lambda x:decodestring(x), elem.split(':'))
                if len(value) > 0:
                    sql1 += ' and {col} '.format(col=col)
                    if S._tableConfig[col]['selectType'] == 0:
                        sql1 += ('= \'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
                    elif S._tableConfig[col]['selectType'] == 1:
                        sql1 += 'like \'%{value}%\''.format(value=value)
                    elif S._tableConfig[col]['selectType'] == 2:
                        sql1 += ('< \'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
                    elif S._tableConfig[col]['selectType'] == 3:
                        sql1 += ('> \'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
                    elif S._tableConfig[col]['selectType'] == 4:
                        sql1 += ('<= \'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
                    elif S._tableConfig[col]['selectType'] == 5:
                        sql1 += ('>= \'{value}\'' if S._tableConfig[col]['type'] in (0, 4) else '{value}').format(value=value)
        cs1.execute(sql1)
        response = dict(result='00', message='OK', data=[])
        for i in range(begin):
            cs1.fetchmany(count)
        for elem in cs1.fetchmany(count):
            dataDict = {}
            dataList = []
            for i in range(len(colList)):
                col = colList[i]
                colValue = elem[i]
                if S._tableConfig[col]['selectType'] == 0 and S._tableConfig[col]['candidate'] == 1:
                    sql2 = 'select {value} from {table} where {key} = '.format(key=S._tableConfig[col]['flexible']['key'], value=S._tableConfig[col]['flexible']['value'], table=S._tableConfig[col]['flexible']['table']) +  ('\'{colValue}\'' if S._tableConfig[col]['type'] in (0, 4) else '{colValue}').format(colValue=colValue)
                    for colWhere in S._tableConfig[col]['flexible']['where']:
                        sql2 += ' and {colWhere} = '.format(colWhere=colWhere) + ('\'{valueWhere}\'' if S._tableConfig[colWhere]['type'] in (0, 4) else '{valueWhere}').format(valueWhere=dataDict[colWhere])
                    cs2.execute(sql2)
                    value = cs2.fetchone()[0]
                    dataList.append('{key}|{value}'.format(key=encodestring(colValue.encode('utf8')), value=encodestring(value.encode('utf8'))))
                else:
                    dataList.append(colValue)
                dataDict[col] = colValue
            response['data'].append(dataList)
        db.close()
        self.wfile.write(dumps(response))

    def do_GET(self):
        self._set_headers()
        parsedPath = urlparse.urlparse(self.path)
        params = urlparse.parse_qs(parsedPath.query)
        filepath = args.rootPath + ('index.html' if parsedPath.path == '/' else parsedPath.path)
        if isfile(filepath):
            print filepath
            with open(filepath, "r") as f:
                self.wfile.write(f.read())
        else:
            if parsedPath.path == '/Init':
                table = params['table'][0]
                self._do_Init(table)
            elif parsedPath.path == '/Range':
                table = params['table'][0]
                key = params['key'][0]
                value = params['value'][0]
                query = params.get('query', [''])[0]
                self._do_Range(key, value, table, query)
            elif parsedPath.path == '/Search':
                table = params['table'][0]
                data = params['data'][0]
                begin = int(params['begin'][0])
                count = int(params['count'][0])
                query = params.get('query', [''])[0]
                self._do_List(table, data, begin, count, query)
            elif parsedPath.path == '/Search':
                table = params['table'][0]
                data = params['data'][0]
                self._do_insert(table, data)

    def do_HEAD(self):
        self._set_headers()

    def do_POST(self):
        self._set_headers()
        parsedPath = urlparse.urlparse(self.path)
        params = loads(self.rfile.read(int(self.headers['Content-Length'])))

        if parsedPath.path == '/Insert':
            table = params['table']
            data = params['data']
            self._do_Insert(table, data)
        elif parsedPath.path == '/Delete':
            table = params['table']
            query = params['query']
            self._do_Delete(table, query)
        elif parsedPath.path == '/Update':
            table = params['table']
            data = params['data']
            query = params['query']
            self._do_Update(table, data, query)


#        self._set_headers()
#        print "in post method"
#
#        self.send_response(200)
#        self.end_headers()
#
#        data = loads(self.data_string)
#        with open("test123456.json", "w") as outfile:
#            dumps(data, outfile)
#        print "{}".format(data)
#        f = open("for_presen.py")
#        self.wfile.write(f.read())
#        return

def run(server_class=HTTPServer, handler_class=S, port=80):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    httpd.serve_forever()

if __name__ == "__main__":
    parser = ArgumentParser(description='Demo Http Server For Easyconf')
    parser.add_argument('-p', action='store', dest='port', type=int, default=80,  help='Port')
    parser.add_argument('-r', action='store', dest='rootPath', default='./',  help='Root Path')
    parser.add_argument('-d', action='store', dest='database', default='demo.db',  help='Database')
    args = parser.parse_args()
    run(port=args.port)
