import { deflateSync } from 'node:zlib';
const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
export function excelManifest(origin: string) {
  const url = new URL(origin);
  if (url.protocol !== 'https:')
    throw Object.assign(
      new Error('Configure FRAME_ORIGIN with HTTPS before downloading the Excel manifest.'),
      { statusCode: 400 },
    );
  const base = escape(url.origin);
  return `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0" xsi:type="TaskPaneApp">
  <Id>4fd656f1-b784-40f3-a9e0-ab96665aa9e7</Id><Version>1.0.0.0</Version><ProviderName>Frame</ProviderName><DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="Frame for Excel"/><Description DefaultValue="Your knowledge. Your infrastructure. Preview and apply workbook changes with your local Frame server."/>
  <IconUrl DefaultValue="${base}/excel-icon.png?size=32"/><HighResolutionIconUrl DefaultValue="${base}/excel-icon.png?size=80"/>
  <SupportUrl DefaultValue="${base}/excel-setup"/>
  <AppDomains><AppDomain>${base}</AppDomain></AppDomains>
  <Hosts><Host Name="Workbook"/></Hosts>
  <Requirements><Sets DefaultMinVersion="1.16"><Set Name="ExcelApi"/></Sets></Requirements>
  <DefaultSettings><SourceLocation DefaultValue="${base}/excel.html"/></DefaultSettings><Permissions>ReadWriteDocument</Permissions>
  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts><Host xsi:type="Workbook"><DesktopFormFactor>
      <FunctionFile resid="Frame.Page"/>
      <ExtensionPoint xsi:type="PrimaryCommandSurface"><OfficeTab id="TabHome"><Group id="Frame.Group">
        <Label resid="Frame.Name"/><Icon><bt:Image size="16" resid="Frame.Icon16"/><bt:Image size="32" resid="Frame.Icon32"/><bt:Image size="80" resid="Frame.Icon80"/></Icon>
        <Control xsi:type="Button" id="Frame.Open"><Label resid="Frame.Name"/>
          <Supertip><Title resid="Frame.Name"/><Description resid="Frame.Description"/></Supertip>
          <Icon><bt:Image size="16" resid="Frame.Icon16"/><bt:Image size="32" resid="Frame.Icon32"/><bt:Image size="80" resid="Frame.Icon80"/></Icon>
          <Action xsi:type="ShowTaskpane"><TaskpaneId>Frame.Excel</TaskpaneId><SourceLocation resid="Frame.Page"/></Action>
        </Control>
      </Group></OfficeTab></ExtensionPoint>
    </DesktopFormFactor></Host></Hosts>
    <Resources><bt:Images>
      <bt:Image id="Frame.Icon16" DefaultValue="${base}/excel-icon.png?size=16"/><bt:Image id="Frame.Icon32" DefaultValue="${base}/excel-icon.png?size=32"/><bt:Image id="Frame.Icon80" DefaultValue="${base}/excel-icon.png?size=80"/>
    </bt:Images><bt:Urls><bt:Url id="Frame.Page" DefaultValue="${base}/excel.html"/></bt:Urls>
      <bt:ShortStrings><bt:String id="Frame.Name" DefaultValue="Frame for Excel"/></bt:ShortStrings>
      <bt:LongStrings><bt:String id="Frame.Description" DefaultValue="Ask Frame about your selection and review proposed changes before applying them."/></bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>`;
}
// Small deterministic F icon; no external image service or build dependency.
export function excelIcon(size: 16 | 32 | 80) {
  const crc = (data: Buffer) => {
    let c = 0xffffffff;
    for (const b of data) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const name = Buffer.from(type),
      len = Buffer.alloc(4),
      sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    sum.writeUInt32BE(crc(Buffer.concat([name, data])));
    return Buffer.concat([len, name, data, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const xx = x / size,
        yy = y / size;
      const f =
        (xx >= 0.28 && xx < 0.43 && yy >= 0.2 && yy < 0.8) ||
        (xx >= 0.28 && xx < 0.76 && yy >= 0.2 && yy < 0.34) ||
        (xx >= 0.28 && xx < 0.65 && yy >= 0.43 && yy < 0.57);
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      pixels.set(f ? [245, 245, 240] : [28, 47, 42], offset);
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
