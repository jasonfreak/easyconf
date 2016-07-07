var easyconf = new Object({
    // basic definition here, pls do not modify them 
    selectHints: {
        0:"等于：",
        1:"包含：",
        2:"小于：",
        3:"大于：",
        4:"小于等于：",
        5:"大于等于："
    },

    names:{
        SEARCH:"查找",
        INSERT:"新增",
        DETAIL:"详情",
        UPDATE:"更新",
        DELETE:"删除",
        FRESH:"刷新",
        PREV:"上页",
        NEXT:"下页",
        GO:"跳转",
        RETURN:"返回",
        COMMIT:"提交",
        OPERATIONS:"操作"
    },
    types:{
        STRING:0,
        INTEGER:1,
        DOUBLE:2,
        BOOLEAN:3,
        DATE:4
    },
    subTitles:['查找', '详情', '更新', '新增'],
    msgs:{
        OK:"通过",
        NOTNULL:"不允许为空",
        INTEGER:"必须为整数",
        DOUBLE:"必须为数字",
        TYPEERROR:"类型错误",
        DATE:"必须为日期:[YYYY-MM-DD hh:mm:ss.ms]",
        NOTUNIQUE:"数据已存在",
    },
    controls:{
        TEXT:0,
        CBOX:1
    },
    views:{
        LIST:0,
        DETAIL:1,
        UPDATE:2,
        INSERT:3
    },
    candidates:
    {
        FIXED:0,
        FLEXIBLE:1
    },
    apps:{
        INIT:"Init",
        LIST:"Search",
        DELETE:"Delete",
        UPDATE:"Update",
        INSERT:"Insert",
        RANGE:"Range"
    },
    dateRE:RegExp("^\\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[1-2]\\d|3[0-1]) ([0-1]\\d|2[0-3]):[0-5]\\d:[0-5]\\d\\.\\d{2}$"),
    _keyStr : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",
    rangeSep:"|",
    colSep:",",
    kvSep:":",

    // basic function here, pls do not modify them
    init:function(http, table) {
        ec = this;

        ec.table = table;

        ec.listContent = [];
        ec.detailContent = {};
        ec.primaryKeyContent = {};
        ec.candidate = {};
        ec.range = {};
        ec.rangeDict = {};
        ec.detailKeyAndValue = {};
        ec.err = {};
        ec.errmsg = {};
        ec.check = {};
        ec.view = null;
        ec.cursor = 0;
        ec.lastquery = null;
        ec.view = ec.views.LIST;
        ec.isCandidateDone = {};

        http.get(ec.apps.INIT, {params:{table:ec.table}}).success(
//        url = "./init.json";
//        http.get(url).success(
            function(response) {
                ec.conf = response;
                ec.setCandidateAndRange();
                ec.isInit = true;
            }
        );
    },

    search:function(http, query) {
        console.log("search...");
        data = ec.getShowCol();
        
        ec.lock();
        http.get(ec.apps.LIST, {params:{table:ec.table, data:ec.list2str(data), query:ec.dict2str(query), begin:0, count:ec.conf.count}}).success(
//        url = "./list.json";
//        http.get(url).success(
            function(response) {
                ec.setListContent(response.data);
                ec.lastquery = ec.clone(query);
                ec.unLock();
            }
        );
    },

    insert:function() {
        ec.setDefaultValue();
        ec.keyContent = {};
        ec.view = 3; // INSERT
        ec.primaryKeyContent = {};
        ec.detailKeyAndValue = {};
        ec.allCheck();
    },

    detail:function(http, row, view) {
        console.log("detail...");
        data = ec.getAllCol();
        query = ec.getPKV(row);
        
        ec.lock();
        http.get(ec.apps.LIST, {params:{table:ec.table, data:ec.list2str(data), query:ec.dict2str(query), begin:0, count:1}}).success(
//        url = "./detail.json"
//        http.get(url).success(
            function(response) {
                ec.setDetailContent(response.data);
                ec.view = view; 
                if (view == ec.views.UPDATE) {
                    ec.allCheck();
                }
                ec.unLock();
            }
        );
    },

    dlt:function(http, row) {
        console.log("delete...");
        query = ec.getPKV(row);
        
        ec.lock();
        http.post(ec.apps.DELETE, {table:ec.table, query:ec.dict2str(query)}).success(
//        url = "./OK.json";
//        http.get(url).success(
            function(response) {
                ec.freshCall();
                ec.unLock();
            }
        );
    },

    jump:function(http) {
        ec.lock();
        http.get(ec.apps.LIST, {params:{table:ec.table, data:ec.list2str(data), query:ec.dict2str(ec.lastquery), begin:ec.cursor, count:ec.conf.count}}).success(
//        url = "./list.json";
//        http.get(url).success(
            function(response) {
                ec.setListContent(response.data);
                ec.unLock();
            }
        );
    },

    prev:function(http) {
        console.log("prev...");
        ec.setPrevCursor();
        ec.jump(http);
    },

    next:function(http) {
        console.log("next...");
        ec.setNextCursor();
        ec.jump(http);
    },

    go:function(http, page) {
        console.log("go...");
        ec.setGoCursor(page);
        ec.jump(http);
    },

    fresh:function(http) {
        console.log("fresh...");
        if (ec.isSearched()) {
            ec.jump(http);
        }
    },

    change:function(column) {
        //should be the first check
        if(column.isPrimaryKey && !ec.checkUnique()) {
            return false;
        }
        if (ec.isBlank(column)) {
            if (!ec.checkNull(column)) {
                return false;
            }
        }
        else {
            if(!ec.checkType(column)) {
                return false;
            }

            if(!ec.selfCheck(column)) {
                return false;
            }

        }
        ec.setOK(column);
        return true;
    },

    setCheck:function(column, change) {
        ec.check[column.id] = change;
    },

    setCandidate:function(http, column) {
        if (ec.isColFlexible(column)) {
            http.get(ec.apps.RANGE, {params:{table:column.flexible.table, key:column.flexible.key, value:column.flexible.value, query:ec.dict2str(ec.getRGV(column))}}).success(
//            url = "./range.json"
//            http.get(url).success(
                function(response) {
                    range = ec.range[column.id] = response.data;
                    ec.rangeDict[column.id] = {};
                    for (var i=0; i<range.length; i++) {
                        key = range[i].key;
                        value = range[i].value;
                        ec.rangeDict[column.id][key] = value;
                    }
                    ec.isCandidateDone[column.id] = true;
                }
            );
        }
    },

    blur:function(column) {
        if (ec.isColFlexible(column)) {
            ec.isCandidateDone[column.id] = false;
            ec.detailKeyAndValue[column.id] = ec.detailContent[column.id] + '-' + ec.rangeDict[column.id][ec.detailContent[column.id]];
        }
    },

    back:function() {
        ec.view = ec.views.LIST; //LIST
        ec.freshCall();
    },

    commit:function(http) {
        query = ec.getDetailPKV();

        if (ec.isUpdateView()) {
            console.log("update...")
            domain = ec.apps.UPDATE;
            config = {table:ec.table, data:ec.dict2str(ec.detailContent), query:ec.dict2str(query)};
        }
        else if (ec.isInsertView()) {
            console.log("insert...")
            domain = ec.apps.INSERT;
            config = {table:ec.table, data:ec.dict2str(ec.detailContent)};
        }
        
        ec.lock();
        http.post(domain, config).success(
//        url = "./OK.json"
//        url = "./NU.json"
//        http.get(url).success(
            function(response) {
                if (response.result == "00") {
                    if (ec.isInsertView()) {
                        ec.setDefaultValue();
                        ec.allCheck();
                        ec.keyContent = {};
                    }
                }
                else if (response.result == "01") {
                    if (ec.isInsertView()) {
                        ec.setPrimaryKeyContent();
                        ec.setUniqueError();
                    }
                }
                ec.unLock();
            }
        );
    },

    getSubTitle:function() {
        return ec.subTitles[ec.view];
    },

    setCandidateAndRange:function() {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (column.control == ec.controls.CBOX && column.candidate == ec.candidates.FIXED) {
                kv = {};
                range = [];
                fixed = column.fixed;
                for (var j=0; j<fixed.length; j++) {
                    key = fixed[j].key;
                    value = fixed[j].value;
                    kv[key] = value;
                    range.push({"key":key, "value":value});
                }
                ec.candidate[column.id] = kv;
                ec.range[column.id] = range;
            }
        }
    },

    isListView:function() {
        return (ec.view == ec.views.LIST);
    },

    isUpdateView:function() {
        return (ec.view == ec.views.UPDATE);
    },

    isInsertView:function() {
        return (ec.view == ec.views.INSERT);
    },

    getCol:function(isOnlyShow) {
        var ret = [];
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (!isOnlyShow || column.isShow || column.isPrimaryKey) {
                ret.push(column.id);
            }
        }
        return ret;
    },

    getShowCol:function() {
        return ec.getCol(true);
    },

    getAllCol:function() {
        return ec.getCol(false);
    },

    getPKV:function(row) {
        var ret = {};
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (column.isPrimaryKey) {
                ret[column.id] = row[column.id];
            }
        }
        return ret;
    },

    getDetailPKV:function() {
        return ec.getPKV(ec.detailContent);
    },

    getRGV:function(column) {
        var ret = {};
        where = column.flexible.where;
        for (var i=0; i<where.length; i++) {
            ret[where[i]] = ec.detailContent[where[i]];      
        }
        return ret;
    },

    list2str:function(list) {
        var ret = "";
        for (var i=0; i<list.length; i++) {
            if (i == 0) {
                ret += ec.encode(String(list[i]));
            }
            else {
                ret += ec.colSep + ec.encode(String(list[i]));
            }
        }
        return ret;
    },

    dict2str:function(dict) {
        var ret = "";
        var count = 0;
        for (key in dict) {
            if (count == 0) {
                ret += ec.encode(String(key)) + ec.kvSep + ec.encode(String(dict[key]));
            }
            else {
                ret += ec.colSep + ec.encode(String(key)) + ec.kvSep + ec.encode(String(dict[key]));
            }
            count += 1;   
        }
        return ret;
    },

    lock:function() {
        ec.disabled = true;
    },

    unLock:function() {
        ec.disabled = false;
    },

    formatListContent:function(row, column) {
        value = row[column.id];
        ret = (column.control < ec.controls.CBOX) ? value : (row[column.id] + "-" + ec.candidate[column.id][value]);
        return ret;
    },

    getContent:function(data, isList) {
        var ret = {};
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            content = data[i];
            if (!isList || column.isShow || column.isPrimaryKey) {
                if (column.control == ec.controls.CBOX && column.candidate == ec.candidates.FLEXIBLE) {
                    idx = content.indexOf("|");
                    keyContent = ec.decode(content.substr(0, idx));
                    valueContent = ec.decode(content.substr(idx+1));
                    ret[column.id] =  keyContent;
                    if (isList) {
                        if (ec.candidate[column.id] == null) {
                            ec.candidate[column.id] = {};
                        }
                        ec.candidate[column.id][keyContent] = valueContent;
                    }
                    else {
                        ec.range[column.id] = [{"key":keyContent, "value":valueContent}];
                        ec.detailKeyAndValue[column.id] = keyContent + '-' + valueContent
                    }
                }
                else {
                    ret[column.id] = content;
                }
            }
        }
        return ret;
    },

    setListContent:function(data) {
        ec.listContent = [];
        for (var i=0; i<data.length; i++) {
            ec.listContent.push(ec.getContent(data[i], true));
        }
    },

    setDetailContent:function(data) {
        ec.detailContent = ec.getContent(data[0], false);
    },

    setPrimaryKeyContent:function() {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (column.isPrimaryKey) {
                ec.primaryKeyContent[column.id] = ec.detailContent[column.id];
            }
        }
    },

    isSearched:function() {
        return (ec.lastquery != null);
    },

    getCurPage:function() {
        return ec.conf == null ? -1 : ((ec.cursor / ec.conf.count) + 1);
    },

    isInt:function(num) {
        return (Math.floor(num) == num)
    },

    isPstInt:function(num) {
        return (ec.isInt(num) && num > 0);
    },

    setPrevCursor:function() {
        if ((ec.cursor - ec.conf.count) < 0) {
            ec.cursor = 0;
        }
        else {
            ec.cursor -= ec.conf.count;
        }
    },

    setNextCursor:function() {
        ec.cursor += ec.conf.count;
    },

    setGoCursor:function(page) {
        ec.cursor = (page-1) * ec.conf.count;
    },

    isColText:function(column) {
        return (column.control == ec.controls.TEXT);
    },

    isColCbox:function(column) {
        return (column.control == ec.controls.CBOX);
    },

    isDetailDisable:function(column) {
        return (ec.view < ec.views.UPDATE || (ec.view == ec.views.UPDATE && column.isPrimaryKey));
    },

    isMsgShow:function() {
        return (ec.view > ec.views.DETAIL);
    },

    isCommitShow:function() {
        return (ec.view > ec.views.DETAIL);
    },

    isBlank:function(column) {
        value = ec.detailContent[column.id];
        return (value == null || String(value).length == 0); 
    },

    checkNull:function(column) {
        if (!column.isNull || column.isPrimaryKey) {
            ec.err[column.id] = false;
            ec.errmsg[column.id] = ec.msgs.NOTNULL;
            return false;
        }
        return true;
    },

    checkType:function(column) {
        value = ec.detailContent[column.id];
        switch (column.type) {
            case ec.types.STRING://String
                break;
            case ec.types.INTEGER://Integer
                if (Math.floor(value) != value) {
                    ec.err[column.id] = false;
                    ec.errmsg[column.id] = ec.msgs.INTEGER;
                    return false;
                }
                break;
            case ec.types.DOUBLE://Double
                if (isNaN(value)) {
                    ec.err[column.id] = false;
                    ec.errmsg[column.id] = ec.msgs.DOUBLE;
                    return false;
                }
                break;
            case ec.types.BOOLEAN://Boolean
                // NOTHING TO DO
                break;
            case ec.types.DATE://Date
                if (!ec.isDate(value)) {
                    ec.err[column.id] = false;
                    ec.errmsg[column.id] = ec.msgs.DATE;
                    return false;
                }
                break;
            default:
                ec.err[column.id] = false;
                ec.errmsg[column.id] = ec.msgs.TYPEERROR;
                return false;
                break;
        }
        return true;
    },

    isDate:function(value) {
        console.log(value);
        return ec.dateRE.test(value);
    },

    selfCheck:function(column) {
        value = ec.detailContent[column.id];
        check = column.check;
        for (var i=0; i<check.length; i++) {
            func = check[i];
            shell = "ec.userfunc." + func.funcname + "(\"" + value + "\"";
            argument = func.argument;
            for (var j=0; j<argument.length; j++) {
                arg = ec.detailContent[argument[i]];
                if (arg == null) {
                    arg = "";
                }
                shell += ", \"" + arg + "\"";
            }
            shell += ")";
            console.log("[shell]" + shell);
            if (!eval(shell)) {
                ec.err[column.id] = false;
                ec.errmsg[column.id] = func.errmsg;
                return false;
            }
        }
        return true;
    },

    isUnique:function() {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (column.isPrimaryKey) {
                if (ec.primaryKeyContent[column.id] == null || ec.detailContent[column.id] != ec.primaryKeyContent[column.id]) {
                    return true;
                }
            }
        }
        return false;
    },

    setUniqueMsg:function(isCorrect) {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            if (column.isPrimaryKey) {
                if (isCorrect) {
                    if (ec.primaryKeyContent[column.id] != null && ec.detailContent[column.id] == ec.primaryKeyContent[column.id]) {
                        ec.err[column.id] = true;
                        ec.errmsg[column.id] = ec.msgs.OK
                    }
                }
                else {
                    ec.err[column.id] = false;
                    ec.errmsg[column.id] = ec.msgs.NOTUNIQUE;
                }
            }
        }
    },

    setUniqueCorrect:function() {
        ec.setUniqueMsg(true);
    },

    setUniqueError:function() {
        ec.setUniqueMsg(false);
    },

    checkUnique:function() {
        if (!ec.isUnique()){
            ec.setUniqueError();
            return false;
        }
        ec.setUniqueCorrect();
        return true;
    },

    setOK:function(column) {
        ec.err[column.id] = true;
        ec.errmsg[column.id] = ec.msgs.OK;
    },

    allOK:function() {
        var i = 0;
        for (k in ec.err) {
            if (!ec.err[k]) {
                return false;
            }
            i += 1;
        }
        if (i == 0) {
            return false;
        }
        else {
            return true;
        }
    },

    allCheck:function() {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            ec.check[column.id]();
        }
    },

    isColFlexible:function(column) {
        return (column.candidate == ec.candidates.FLEXIBLE);
    },

    getSelectHint:function(column) {
        return ec.selectHints[column.selectType];
    },

    setDefaultValue:function() {
        columns = ec.conf.columns;
        for (var i=0; i<columns.length; i++) {
            column = columns[i];
            ec.detailContent[column.id] = column.dft;
        }
    },
    
    // public method for encoding
    encode : function (input) {
        var output = "";
        var chr1, chr2, chr3, enc1, enc2, enc3, enc4;
        var i = 0;

        input = ec._utf8_encode(input);

        while (i < input.length) {

            chr1 = input.charCodeAt(i++);
            chr2 = input.charCodeAt(i++);
            chr3 = input.charCodeAt(i++);

            enc1 = chr1 >> 2;
            enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
            enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
            enc4 = chr3 & 63;

            if (isNaN(chr2)) {
                enc3 = enc4 = 64;
            } else if (isNaN(chr3)) {
                enc4 = 64;
            }

            output = output +
            this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) +
            this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);

        }

        return output;
    },

    // public method for decoding
    decode : function (input) {
        var output = "";
        var chr1, chr2, chr3;
        var enc1, enc2, enc3, enc4;
        var i = 0;

        input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");

        while (i < input.length) {

            enc1 = this._keyStr.indexOf(input.charAt(i++));
            enc2 = this._keyStr.indexOf(input.charAt(i++));
            enc3 = this._keyStr.indexOf(input.charAt(i++));
            enc4 = this._keyStr.indexOf(input.charAt(i++));

            chr1 = (enc1 << 2) | (enc2 >> 4);
            chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
            chr3 = ((enc3 & 3) << 6) | enc4;

            output = output + String.fromCharCode(chr1);

            if (enc3 != 64) {
                output = output + String.fromCharCode(chr2);
            }
            if (enc4 != 64) {
                output = output + String.fromCharCode(chr3);
            }

        }

        output = ec._utf8_decode(output);

        return output;

    },

    // private method for UTF-8 encoding
    _utf8_encode : function (string) {
        string = string.replace(/\r\n/g,"\n");
        var utftext = "";

        for (var n = 0; n < string.length; n++) {

            var c = string.charCodeAt(n);

            if (c < 128) {
                utftext += String.fromCharCode(c);
            }
            else if((c > 127) && (c < 2048)) {
                utftext += String.fromCharCode((c >> 6) | 192);
                utftext += String.fromCharCode((c & 63) | 128);
            }
            else {
                utftext += String.fromCharCode((c >> 12) | 224);
                utftext += String.fromCharCode(((c >> 6) & 63) | 128);
                utftext += String.fromCharCode((c & 63) | 128);
            }

        }

        return utftext;
    },

    // private method for UTF-8 decoding
    _utf8_decode : function (utftext) {
        var string = "";
        var i = 0;
        var c = c1 = c2 = 0;

        while ( i < utftext.length ) {

            c = utftext.charCodeAt(i);

            if (c < 128) {
                string += String.fromCharCode(c);
                i++;
            }
            else if (c > 191 && c < 224) {
                c2 = utftext.charCodeAt(i+1);
                string += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
                i += 2;
            }
            else {
                c2 = utftext.charCodeAt(i+1);
                c3 = utftext.charCodeAt(i+2);
                string += String.fromCharCode(((c & 15) << 12) | ((c2 & 63) << 6) | (c3 & 63));
                i += 3;
            }

        }

        return string;
    },

    clone:function (obj) {
        var copy;

        if (null == obj || "object" != typeof obj) return obj;

        if (obj instanceof Date) {
            copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        if (obj instanceof Array) {
            copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = ec.clone(obj[i]);
            }
            return copy;
        }

        if (obj instanceof Object) {
            copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = ec.clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    },

    // user's function here
    userfunc: {
        checkIp:function(ip) {
            var exp=/^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/; 
            var reg = ip.match(exp);
            if(reg  != null) 
                return true;
            else
                return false;
        },

        checkPort:function(port) {
            if (0 <= port && port <= 65535)
                return true;
            else
                return false;
        }
    }
});
