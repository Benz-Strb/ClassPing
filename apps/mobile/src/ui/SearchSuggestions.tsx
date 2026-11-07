import {useMemo, useState} from 'react';
import {Linking, Platform, View} from 'react-native';
import {WebView} from '@expo/dom-webview';

export function SearchSuggestions({html}: {html: string}) {
  const [height, setHeight] = useState(96);
  const document = useMemo(() => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https://www.gstatic.com; font-src https://fonts.gstatic.com; script-src 'none'; base-uri 'none'; form-action 'none'"></head><body style="margin:0">${html}</body></html>`, [html]);
  if (Platform.OS === 'web') return <iframe title="Google Search suggestions" srcDoc={document} sandbox="allow-popups allow-popups-to-escape-sandbox" style={{width: '100%', height: 180, border: 0}}/>;
  return <View style={{height}} accessibilityLabel="คำค้นที่แนะนำจาก Google">
    <WebView source={{uri: `data:text/html;charset=utf-8,${encodeURIComponent(document)}`}} useExpoModulesBridge={false} scrollEnabled={false} automaticallyAdjustContentInsets={false}
      injectedJavaScript={`(function(){
        function size(){window.ReactNativeWebView.postMessage(JSON.stringify({height:Math.ceil(document.body.getBoundingClientRect().height)}));}
        document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){e.preventDefault();if(e.isTrusted)window.ReactNativeWebView.postMessage(JSON.stringify({url:a.href}));}},true);
        new ResizeObserver(size).observe(document.body);size();
      })();true;`}
      onMessage={event => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (typeof data.height === 'number' && Number.isFinite(data.height)) setHeight(Math.max(64, Math.min(500, data.height)));
          if (typeof data.url === 'string' && /^https?:\/\//i.test(data.url)) void Linking.openURL(data.url).catch(() => {});
        } catch {}
      }}/>
  </View>;
}
